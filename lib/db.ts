import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ArticleCategory = 'lab' | 'academic';

export interface Article {
  title: string;
  link: string;
  date: string;
  source:
    | 'Google Research'
    | 'Google DeepMind'
    | 'Google Cloud AI'
    | 'OpenAI'
    | 'Anthropic'
    | 'Microsoft Research'
    | 'Meta AI'
    | 'x.AI'
    | 'Chinese Frontier'
    | 'arXiv';
  snippet: string;
  tags?: string[];
  embedding?: number[];
  score?: number;
  summary?: string;
  keyInnovation?: string;
  significance?: string;
  // Separate domain discriminator: 'lab' (default) vs 'academic' (arXiv/scholarly preprints)
  category?: ArticleCategory;
  // Academic-specific metadata (abstract + short summary only — never full paper body)
  authors?: string[];
  arxivId?: string;
  pdfUrl?: string;
  venue?: string;
  primaryCategory?: string;
  abstract?: string;
  citationCount?: number;
}

export interface AcademicPaper extends Article {
  category: 'academic';
  source: 'arXiv';
  arxivId: string;
  pdfUrl: string;
  abstract: string;
  authors: string[];
  primaryCategory: string;
  venue: string;
  citationCount: number;
}

export interface DBStats {
  engine: 'postgres' | 'sqlite-fallback';
  totalArticles: number;
  totalAcademicPapers: number;
  embeddedArticles: number;
  academicEmbeddedCount: number;
  taggedArticles: number;
  cachedSummaries: number;
  articles2026Count?: number;
  gcsArchiveStatus?: string;
  sourceCounts: Record<string, number>;
  academicCategoryCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Singleton PostgreSQL Connection Pool (attached to globalThis to prevent HMR leaks)
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __sqliteDb: any | undefined;
}

function getPgPool(): Pool {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new Pool({
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'temp_password_123',
      database: process.env.POSTGRES_DB || 'postgres',
      port: 5432,
      max: 5, // Prevent Cloud SQL error 53300 (too many connections)
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl:
        process.env.NODE_ENV === 'production' &&
        !process.env.POSTGRES_HOST?.startsWith('/cloudsql/')
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  return globalThis.__pgPool;
}

// ---------------------------------------------------------------------------
// Native SQLite Fallback Engine (node:sqlite on data/news.db)
// Ensures 100% uptime locally and when Cloud SQL proxy is offline
// ---------------------------------------------------------------------------
function getSqliteDb(): any {
  if (!globalThis.__sqliteDb) {
    try {
      // Dynamic require so Next.js bundler doesn't complain
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      const dbDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
      const dbPath = path.join(dbDir, 'news.db');
      const db = new DatabaseSync(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS articles (
          link TEXT PRIMARY KEY,
          title TEXT,
          date TEXT,
          source TEXT,
          snippet TEXT,
          tags TEXT,
          embedding TEXT,
          summary TEXT,
          key_innovation TEXT,
          significance TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sqlite_date ON articles(date DESC);
        CREATE INDEX IF NOT EXISTS idx_sqlite_source ON articles(source);
        CREATE TABLE IF NOT EXISTS cached_summaries (
          link TEXT PRIMARY KEY,
          summary TEXT,
          key_innovation TEXT,
          significance TEXT,
          topics TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS self_improvement_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT,
          model_used TEXT,
          action TEXT,
          metrics_before TEXT,
          metrics_after TEXT,
          notes TEXT
        );
      `);
      // Safely add columns if existing data/news.db was created prior to schema upgrade
      for (const col of [
        'summary TEXT',
        'key_innovation TEXT',
        'significance TEXT',
        "category TEXT DEFAULT 'lab'",
        'authors TEXT',
        'arxiv_id TEXT',
        'pdf_url TEXT',
        'venue TEXT',
        'primary_category TEXT',
        'abstract TEXT',
        'citation_count INTEGER DEFAULT 0',
      ]) {
        try {
          db.exec(`ALTER TABLE articles ADD COLUMN ${col};`);
        } catch {}
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sqlite_category ON articles(category);
        CREATE INDEX IF NOT EXISTS idx_sqlite_arxiv_id ON articles(arxiv_id);
        CREATE INDEX IF NOT EXISTS idx_sqlite_primary_category ON articles(primary_category);
      `);
      globalThis.__sqliteDb = db;
    } catch (e) {
      console.error('[DB] Failed to initialize node:sqlite fallback:', e);
    }
  }
  return globalThis.__sqliteDb;
}

// ---------------------------------------------------------------------------
// Engine Health State & Zero-Loss Cross-Hydration
// ---------------------------------------------------------------------------
let pgHealthy: boolean | null = null;
let lastPgCheck = 0;
let hydrationDone = false;
const PG_RETRY_INTERVAL_MS = 60_000;

async function ensureDatabaseHydrated(pgClient?: any): Promise<void> {
  if (hydrationDone) return;
  hydrationDone = true;

  try {
    const sqlite = getSqliteDb();
    let sqliteCount = 0;
    if (sqlite) {
      sqliteCount = sqlite.prepare(`SELECT count(*) as c FROM articles`).get()?.c || 0;
    }

    // 1. If SQLite is empty or stale (< 1500 articles), hydrate from GCS Master Archive
    if (sqliteCount < 1500) {
      const { restoreArticlesFromGCS } = await import('./gcs-archive');
      const gcsArticles = await restoreArticlesFromGCS();
      if (gcsArticles.length > sqliteCount && sqlite) {
        console.log(
          `[DB-Hydrate] Restoring ${gcsArticles.length} articles from GCS Master Archive into SQLite...`
        );
        const stmt = sqlite.prepare(`
          INSERT INTO articles (
            link, title, date, source, snippet, tags, embedding, summary,
            category, authors, arxiv_id, pdf_url, venue, primary_category, abstract, citation_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(link) DO UPDATE SET
            title = excluded.title,
            date = excluded.date,
            snippet = excluded.snippet,
            tags = CASE WHEN excluded.tags != '[]' THEN excluded.tags ELSE articles.tags END,
            embedding = COALESCE(excluded.embedding, articles.embedding),
            summary = COALESCE(excluded.summary, articles.summary),
            category = COALESCE(excluded.category, articles.category, 'lab'),
            authors = COALESCE(excluded.authors, articles.authors),
            arxiv_id = COALESCE(excluded.arxiv_id, articles.arxiv_id),
            pdf_url = COALESCE(excluded.pdf_url, articles.pdf_url),
            venue = COALESCE(excluded.venue, articles.venue),
            primary_category = COALESCE(excluded.primary_category, articles.primary_category),
            abstract = COALESCE(excluded.abstract, articles.abstract),
            citation_count = COALESCE(excluded.citation_count, articles.citation_count, 0)
        `);
        for (const a of gcsArticles) {
          stmt.run(
            a.link,
            a.title,
            a.date,
            a.source,
            a.snippet,
            JSON.stringify(a.tags || []),
            a.embedding ? JSON.stringify(a.embedding) : null,
            a.summary || null,
            a.category || 'lab',
            a.authors ? JSON.stringify(a.authors) : null,
            a.arxivId || null,
            a.pdfUrl || null,
            a.venue || null,
            a.primaryCategory || null,
            a.abstract || null,
            a.citationCount ?? 0
          );
        }
        sqliteCount = gcsArticles.length;
      }
    }

    // 2. If PostgreSQL is online, ensure it has all SQLite/GCS articles (including academic + 2026 articles)
    if (pgClient && sqlite) {
      const pgRes = await pgClient.query(`SELECT count(*)::int AS c FROM articles`);
      const pgCount = pgRes.rows[0]?.c || 0;

      if (sqliteCount > pgCount) {
        console.log(
          `[DB-Hydrate] Syncing ${sqliteCount} articles from SQLite/GCS into Cloud SQL Postgres (current pgCount: ${pgCount})...`
        );
        const allSqliteRows = sqlite
          .prepare(
            `SELECT link, title, date, source, snippet, tags, embedding, summary,
                    COALESCE(category, 'lab') as category, authors, arxiv_id, pdf_url,
                    venue, primary_category, abstract, COALESCE(citation_count, 0) as citation_count
             FROM articles`
          )
          .all();

        const CHUNK = 150;
        for (let i = 0; i < allSqliteRows.length; i += CHUNK) {
          const batch = allSqliteRows.slice(i, i + CHUNK);
          const links = batch.map((r: any) => r.link);
          const titles = batch.map((r: any) => r.title);
          const dates = batch.map((r: any) => r.date);
          const sources = batch.map((r: any) => r.source);
          const snippets = batch.map((r: any) => r.snippet);
          const tags = batch.map((r: any) => r.tags || '[]');
          const embeddings = batch.map((r: any) => r.embedding || null);
          const summaries = batch.map((r: any) => r.summary || null);
          const categories = batch.map((r: any) => r.category || 'lab');
          const authors = batch.map((r: any) => r.authors || null);
          const arxivIds = batch.map((r: any) => r.arxiv_id || null);
          const pdfUrls = batch.map((r: any) => r.pdf_url || null);
          const venues = batch.map((r: any) => r.venue || null);
          const primaryCategories = batch.map((r: any) => r.primary_category || null);
          const abstracts = batch.map((r: any) => r.abstract || null);
          const citationCounts = batch.map((r: any) => Number(r.citation_count || 0));

          await pgClient.query(
            `
            INSERT INTO articles (
              link, title, date, source, snippet, tags, embedding, summary,
              category, authors, arxiv_id, pdf_url, venue, primary_category, abstract, citation_count
            )
            SELECT
              unnest($1::text[]),
              unnest($2::text[]),
              unnest($3::timestamptz[]),
              unnest($4::text[]),
              unnest($5::text[]),
              unnest($6::text[]),
              unnest($7::text[])::vector,
              unnest($8::text[]),
              unnest($9::text[]),
              unnest($10::text[]),
              unnest($11::text[]),
              unnest($12::text[]),
              unnest($13::text[]),
              unnest($14::text[]),
              unnest($15::text[]),
              unnest($16::int[])
            ON CONFLICT (link) DO UPDATE SET
              title            = EXCLUDED.title,
              date             = EXCLUDED.date,
              snippet          = EXCLUDED.snippet,
              tags             = EXCLUDED.tags,
              embedding        = COALESCE(EXCLUDED.embedding, articles.embedding),
              summary          = COALESCE(EXCLUDED.summary, articles.summary),
              category         = COALESCE(EXCLUDED.category, articles.category, 'lab'),
              authors          = COALESCE(EXCLUDED.authors, articles.authors),
              arxiv_id         = COALESCE(EXCLUDED.arxiv_id, articles.arxiv_id),
              pdf_url          = COALESCE(EXCLUDED.pdf_url, articles.pdf_url),
              venue            = COALESCE(EXCLUDED.venue, articles.venue),
              primary_category = COALESCE(EXCLUDED.primary_category, articles.primary_category),
              abstract         = COALESCE(EXCLUDED.abstract, articles.abstract),
              citation_count   = GREATEST(COALESCE(EXCLUDED.citation_count, 0), COALESCE(articles.citation_count, 0))
            `,
            [
              links, titles, dates, sources, snippets, tags, embeddings, summaries,
              categories, authors, arxivIds, pdfUrls, venues, primaryCategories, abstracts, citationCounts,
            ]
          );
        }
        console.log(`[DB-Hydrate] Cloud SQL Postgres synchronized with ${allSqliteRows.length} articles.`);
      }
    }
  } catch (err: any) {
    console.warn('[DB-Hydrate] Hydration warning (non-fatal):', err?.message || err);
  }
}

async function isPostgresAvailable(): Promise<boolean> {
  const now = Date.now();
  if (pgHealthy !== null && now - lastPgCheck < PG_RETRY_INTERVAL_MS) {
    return pgHealthy;
  }
  lastPgCheck = now;
  try {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`
        CREATE TABLE IF NOT EXISTS articles (
          link           TEXT PRIMARY KEY,
          title          TEXT,
          date           TIMESTAMP WITH TIME ZONE,
          source         TEXT,
          snippet        TEXT,
          tags           TEXT,
          embedding      vector(768),
          summary        TEXT,
          key_innovation TEXT,
          significance   TEXT,
          created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS summary TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS key_innovation TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS significance TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'lab';
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS authors TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS arxiv_id TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS pdf_url TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS venue TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS primary_category TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS abstract TEXT;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS citation_count INTEGER DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_articles_date ON articles (date DESC);
        CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source);
        CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
        CREATE INDEX IF NOT EXISTS idx_articles_arxiv_id ON articles (arxiv_id);
        CREATE INDEX IF NOT EXISTS idx_articles_primary_category ON articles (primary_category);
      `);
      pgHealthy = true;
      await ensureDatabaseHydrated(client);
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (pgHealthy !== false) {
      console.warn(
        `[DB] PostgreSQL unreachable (${err?.code || err?.message || 'offline'}) — seamlessly active on local SQLite engine (data/news.db).`
      );
    }
    pgHealthy = false;
    await ensureDatabaseHydrated();
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseTags(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseEmbedding(raw: any): number[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function mapRow(row: any, includeEmbedding = false): Article {
  const article: Article = {
    title: row.title || 'Untitled Research',
    link: row.link,
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date || new Date().toISOString()),
    source: row.source || 'Google Research',
    snippet: row.snippet || '',
    tags: parseTags(row.tags),
    score: typeof row.score === 'number' ? row.score : undefined,
    summary: row.summary || undefined,
    keyInnovation: row.key_innovation || undefined,
    significance: row.significance || undefined,
    category: row.category === 'academic' ? 'academic' : 'lab',
    authors: row.authors ? parseTags(row.authors) : undefined,
    arxivId: row.arxiv_id || undefined,
    pdfUrl: row.pdf_url || undefined,
    venue: row.venue || undefined,
    primaryCategory: row.primary_category || undefined,
    abstract: row.abstract || undefined,
    citationCount:
      row.citation_count !== undefined && row.citation_count !== null
        ? Number(row.citation_count)
        : undefined,
  };
  if (includeEmbedding) {
    article.embedding = parseEmbedding(row.embedding);
  }
  return article;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// saveArticles — Upsert into active engine (and mirror to SQLite for local persistence)
// Supports both Lab articles (category='lab') and Academic papers (category='academic')
// ---------------------------------------------------------------------------
export async function saveArticles(
  articles: Article[],
  options?: { skipGcsBackup?: boolean }
): Promise<void> {
  if (articles.length === 0) return;

  // Always mirror to SQLite so data/news.db stays enriched
  const sqlite = getSqliteDb();
  if (sqlite) {
    try {
      const stmt = sqlite.prepare(`
        INSERT INTO articles (
          link, title, date, source, snippet, tags, embedding, summary, key_innovation, significance,
          category, authors, arxiv_id, pdf_url, venue, primary_category, abstract, citation_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(link) DO UPDATE SET
          title = excluded.title,
          date = excluded.date,
          snippet = excluded.snippet,
          tags = CASE WHEN excluded.tags != '[]' THEN excluded.tags ELSE articles.tags END,
          embedding = COALESCE(excluded.embedding, articles.embedding),
          summary = COALESCE(excluded.summary, articles.summary),
          key_innovation = COALESCE(excluded.key_innovation, articles.key_innovation),
          significance = COALESCE(excluded.significance, articles.significance),
          category = COALESCE(excluded.category, articles.category, 'lab'),
          authors = COALESCE(excluded.authors, articles.authors),
          arxiv_id = COALESCE(excluded.arxiv_id, articles.arxiv_id),
          pdf_url = COALESCE(excluded.pdf_url, articles.pdf_url),
          venue = COALESCE(excluded.venue, articles.venue),
          primary_category = COALESCE(excluded.primary_category, articles.primary_category),
          abstract = COALESCE(excluded.abstract, articles.abstract),
          citation_count = MAX(COALESCE(excluded.citation_count, 0), COALESCE(articles.citation_count, 0))
      `);
      for (const a of articles) {
        stmt.run(
          a.link,
          a.title,
          a.date,
          a.source,
          a.snippet,
          JSON.stringify(a.tags || []),
          a.embedding ? JSON.stringify(a.embedding) : null,
          a.summary || null,
          a.keyInnovation || null,
          a.significance || null,
          a.category || 'lab',
          a.authors ? JSON.stringify(a.authors) : null,
          a.arxivId || null,
          a.pdfUrl || null,
          a.venue || null,
          a.primaryCategory || null,
          a.abstract || null,
          a.citationCount ?? 0
        );
      }
    } catch (e) {
      console.error('[DB] SQLite mirror upsert error:', e);
    }
  }

  if (await isPostgresAvailable()) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      const CHUNK = 150;
      for (let i = 0; i < articles.length; i += CHUNK) {
        const batch = articles.slice(i, i + CHUNK);
        const links: string[] = [];
        const titles: string[] = [];
        const dates: string[] = [];
        const sources: string[] = [];
        const snippets: string[] = [];
        const tags: string[] = [];
        const embeddings: (string | null)[] = [];
        const summaries: (string | null)[] = [];
        const keyInnovations: (string | null)[] = [];
        const significances: (string | null)[] = [];
        const categories: string[] = [];
        const authors: (string | null)[] = [];
        const arxivIds: (string | null)[] = [];
        const pdfUrls: (string | null)[] = [];
        const venues: (string | null)[] = [];
        const primaryCategories: (string | null)[] = [];
        const abstracts: (string | null)[] = [];
        const citationCounts: number[] = [];

        for (const a of batch) {
          links.push(a.link);
          titles.push(a.title);
          dates.push(a.date);
          sources.push(a.source);
          snippets.push(a.snippet);
          tags.push(JSON.stringify(a.tags || []));
          embeddings.push(a.embedding ? JSON.stringify(a.embedding) : null);
          summaries.push(a.summary || null);
          keyInnovations.push(a.keyInnovation || null);
          significances.push(a.significance || null);
          categories.push(a.category || 'lab');
          authors.push(a.authors ? JSON.stringify(a.authors) : null);
          arxivIds.push(a.arxivId || null);
          pdfUrls.push(a.pdfUrl || null);
          venues.push(a.venue || null);
          primaryCategories.push(a.primaryCategory || null);
          abstracts.push(a.abstract || null);
          citationCounts.push(Number(a.citationCount ?? 0));
        }

        await client.query(
          `
          INSERT INTO articles (
            link, title, date, source, snippet, tags, embedding, summary, key_innovation, significance,
            category, authors, arxiv_id, pdf_url, venue, primary_category, abstract, citation_count
          )
          SELECT
            unnest($1::text[]),
            unnest($2::text[]),
            unnest($3::timestamptz[]),
            unnest($4::text[]),
            unnest($5::text[]),
            unnest($6::text[]),
            unnest($7::text[])::vector,
            unnest($8::text[]),
            unnest($9::text[]),
            unnest($10::text[]),
            unnest($11::text[]),
            unnest($12::text[]),
            unnest($13::text[]),
            unnest($14::text[]),
            unnest($15::text[]),
            unnest($16::text[]),
            unnest($17::text[]),
            unnest($18::int[])
          ON CONFLICT (link) DO UPDATE SET
            title            = EXCLUDED.title,
            date             = EXCLUDED.date,
            snippet          = EXCLUDED.snippet,
            tags             = CASE WHEN EXCLUDED.tags != '[]' THEN EXCLUDED.tags ELSE articles.tags END,
            embedding        = COALESCE(EXCLUDED.embedding, articles.embedding),
            summary          = COALESCE(EXCLUDED.summary, articles.summary),
            key_innovation   = COALESCE(EXCLUDED.key_innovation, articles.key_innovation),
            significance     = COALESCE(EXCLUDED.significance, articles.significance),
            category         = COALESCE(EXCLUDED.category, articles.category, 'lab'),
            authors          = COALESCE(EXCLUDED.authors, articles.authors),
            arxiv_id         = COALESCE(EXCLUDED.arxiv_id, articles.arxiv_id),
            pdf_url          = COALESCE(EXCLUDED.pdf_url, articles.pdf_url),
            venue            = COALESCE(EXCLUDED.venue, articles.venue),
            primary_category = COALESCE(EXCLUDED.primary_category, articles.primary_category),
            abstract         = COALESCE(EXCLUDED.abstract, articles.abstract),
            citation_count   = GREATEST(COALESCE(EXCLUDED.citation_count, 0), COALESCE(articles.citation_count, 0))
          `,
          [
            links, titles, dates, sources, snippets, tags, embeddings,
            summaries, keyInnovations, significances,
            categories, authors, arxivIds, pdfUrls, venues, primaryCategories, abstracts, citationCounts,
          ]
        );
      }
    } catch (e) {
      console.error('[DB] Postgres saveArticles error:', e);
    } finally {
      client.release();
    }
  }

  // Trigger non-blocking GCS master archive backup so articles are never lost
  if (!options?.skipGcsBackup) {
    (async () => {
      try {
        const { backupArticlesToGCS } = await import('./gcs-archive');
        const allArticles = await getArticles(10000, undefined, 0, undefined, true, 'all');
        await backupArticlesToGCS(allArticles);
      } catch (e) {
        console.warn('[DB] Background GCS archive backup error:', e);
      }
    })();
  }
}

export async function saveAcademicPapers(
  papers: AcademicPaper[],
  options?: { skipGcsBackup?: boolean }
): Promise<void> {
  const normalized = papers.map((p) => ({
    ...p,
    category: 'academic' as const,
    source: 'arXiv' as const,
  }));
  await saveArticles(normalized, options);
}

// ---------------------------------------------------------------------------
// getArticles — Paginated & filtered, strictly scoped to category='lab' by default
// Pass category='all' ONLY for full cross-tier GCS master archive export
// ---------------------------------------------------------------------------
const ARTICLE_SELECT_COLS =
  'title, link, date, source, snippet, tags, summary, key_innovation, significance, category, authors, arxiv_id, pdf_url, venue, primary_category, abstract, citation_count';

export async function getArticles(
  limit = 100,
  startDate?: Date,
  offset = 0,
  sourceFilter?: string,
  includeEmbedding = false,
  category: ArticleCategory | 'all' = 'lab',
  primaryCategory?: string,
  sortBy: 'latest' | 'impact' = 'latest'
): Promise<Article[]> {
  if (await isPostgresAvailable()) {
    try {
      const pool = getPgPool();
      const params: any[] = [limit, offset];
      const conditions: string[] = [];

      if (category !== 'all') {
        params.push(category);
        conditions.push(`COALESCE(category, 'lab') = $${params.length}`);
      }
      if (startDate) {
        params.push(startDate.toISOString());
        conditions.push(`date >= $${params.length}`);
      }
      if (sourceFilter) {
        params.push(sourceFilter);
        conditions.push(`source = $${params.length}`);
      }
      if (primaryCategory) {
        params.push(primaryCategory);
        conditions.push(`primary_category = $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const embCol = includeEmbedding ? ', embedding::text' : '';
      const orderBy =
        sortBy === 'impact'
          ? 'ORDER BY COALESCE(citation_count, 0) DESC, date DESC'
          : 'ORDER BY date DESC';

      const res = await pool.query(
        `SELECT ${ARTICLE_SELECT_COLS}${embCol}
         FROM articles
         ${whereClause}
         ${orderBy}
         LIMIT $1 OFFSET $2`,
        params
      );
      return res.rows.map((r) => mapRow(r, includeEmbedding));
    } catch (e) {
      console.error('[DB] Postgres getArticles failed, falling back to SQLite:', e);
    }
  }

  const sqlite = getSqliteDb();
  if (!sqlite) return [];

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (category !== 'all') {
      conditions.push(`COALESCE(a.category, 'lab') = ?`);
      params.push(category);
    }
    if (startDate) {
      conditions.push(`a.date >= ?`);
      params.push(startDate.toISOString());
    }
    if (sourceFilter) {
      conditions.push(`a.source = ?`);
      params.push(sourceFilter);
    }
    if (primaryCategory) {
      conditions.push(`a.primary_category = ?`);
      params.push(primaryCategory);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const embCol = includeEmbedding ? ', a.embedding' : '';
    const orderBy =
      sortBy === 'impact'
        ? 'ORDER BY COALESCE(a.citation_count, 0) DESC, a.date DESC'
        : 'ORDER BY a.date DESC';

    const rows = sqlite
      .prepare(
        `SELECT a.title, a.link, a.date, a.source, a.snippet, a.tags${embCol},
                COALESCE(c.summary, a.summary) as summary,
                COALESCE(c.key_innovation, a.key_innovation) as key_innovation,
                COALESCE(c.significance, a.significance) as significance,
                a.category, a.authors, a.arxiv_id, a.pdf_url, a.venue,
                a.primary_category, a.abstract, a.citation_count
         FROM articles a
         LEFT JOIN cached_summaries c ON a.link = c.link
         ${whereClause}
         ${orderBy}
         LIMIT ? OFFSET ?`
      )
      .all(...params);

    return rows.map((r: any) => mapRow(r, includeEmbedding));
  } catch (e) {
    console.error('[DB] SQLite getArticles error:', e);
    return [];
  }
}

export async function getAcademicPapers(options?: {
  limit?: number;
  startDate?: Date;
  offset?: number;
  primaryCategory?: string;
  sortBy?: 'latest' | 'impact';
}): Promise<AcademicPaper[]> {
  const rows = await getArticles(
    options?.limit ?? 30,
    options?.startDate,
    options?.offset ?? 0,
    undefined,
    false,
    'academic',
    options?.primaryCategory,
    options?.sortBy ?? 'latest'
  );
  return rows as AcademicPaper[];
}

// ---------------------------------------------------------------------------
// searchArticlesHybrid — True Hybrid Search (Vector + Lexical Full-Text + Exact Match)
// Works across ALL articles (including newly ingested unembedded rows), supports
// timeRange (startDate), lab filter (sourceFilter), relevance floor, and pagination.
// ---------------------------------------------------------------------------
function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export async function searchArticlesHybrid(
  query: string,
  queryEmbedding: number[] | null,
  limit = 50,
  sourceFilter?: string,
  startDate?: Date,
  offset = 0,
  category: ArticleCategory = 'lab',
  primaryCategory?: string
): Promise<Article[]> {
  const cleanQuery = query.trim().toLowerCase();
  const terms = cleanQuery
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter((t) => t.length > 1)
    .slice(0, 6);

  if (await isPostgresAvailable()) {
    try {
      const pool = getPgPool();
      const params: any[] = [];
      const addParam = (val: any): string => {
        params.push(val);
        return `$${params.length}`;
      };

      const whereFilters: string[] = [
        `COALESCE(category, 'lab') = ${addParam(category)}`,
      ];
      if (sourceFilter) {
        whereFilters.push(`source = ${addParam(sourceFilter)}`);
      }
      if (primaryCategory) {
        whereFilters.push(`primary_category = ${addParam(primaryCategory)}`);
      }
      if (startDate) {
        whereFilters.push(`date >= ${addParam(startDate.toISOString())}`);
      }

      const filterSql = `WHERE ${whereFilters.join(' AND ')}`;

      // Vector similarity component (0 when embedding is missing or queryEmbedding is null)
      let vecExpr = '0.0::double precision';
      if (queryEmbedding) {
        const vecParam = addParam(JSON.stringify(queryEmbedding));
        vecExpr = `CASE WHEN embedding IS NOT NULL THEN GREATEST(0.0, 1.0 - (embedding <=> ${vecParam}::vector)) ELSE 0.0 END`;
      }

      // Lexical & full-text component (searches abstract, authors, arxiv_id, and summary as well)
      let lexExpr = '0.0::double precision';
      if (cleanQuery) {
        const qParam = addParam(cleanQuery);
        const phraseLike = addParam(`%${escapeLike(cleanQuery)}%`);
        const lexParts: string[] = [
          `CASE WHEN title ILIKE ${phraseLike} ESCAPE '\\' THEN 0.45 ELSE 0.0 END`,
          `CASE WHEN tags ILIKE ${phraseLike} ESCAPE '\\' THEN 0.30 ELSE 0.0 END`,
          `CASE WHEN COALESCE(abstract, snippet, '') ILIKE ${phraseLike} ESCAPE '\\' THEN 0.18 ELSE 0.0 END`,
          `CASE WHEN COALESCE(summary, '') ILIKE ${phraseLike} ESCAPE '\\' THEN 0.16 ELSE 0.0 END`,
          `CASE WHEN source ILIKE ${phraseLike} ESCAPE '\\' OR COALESCE(authors, '') ILIKE ${phraseLike} ESCAPE '\\' OR COALESCE(arxiv_id, '') ILIKE ${phraseLike} ESCAPE '\\' THEN 0.25 ELSE 0.0 END`,
          `LEAST(0.40, COALESCE(ts_rank_cd(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(tags, '') || ' ' || COALESCE(abstract, snippet, '') || ' ' || COALESCE(summary, '')), plainto_tsquery('english', ${qParam})), 0.0) * 0.8)`,
        ];

        for (const term of terms) {
          const termLike = addParam(`%${escapeLike(term)}%`);
          lexParts.push(
            `(CASE WHEN title ILIKE ${termLike} ESCAPE '\\' THEN 0.16 WHEN tags ILIKE ${termLike} ESCAPE '\\' THEN 0.10 WHEN COALESCE(abstract, snippet, '') ILIKE ${termLike} ESCAPE '\\' OR COALESCE(authors, '') ILIKE ${termLike} ESCAPE '\\' THEN 0.05 ELSE 0.0 END)`
          );
        }
        lexExpr = `(${lexParts.join(' + ')})`;
      }

      const limitParam = addParam(limit);
      const offsetParam = addParam(offset);

      const combinedExpr = queryEmbedding
        ? `LEAST(0.99, (vec_score * 0.62) + lex_score)`
        : `LEAST(0.99, lex_score)`;
      const relevanceGate = cleanQuery
        ? `WHERE (lex_score > 0.0 OR vec_score >= 0.56)`
        : `WHERE vec_score >= 0.30`;

      const res = await pool.query(
        `WITH scored AS (
           SELECT
             ${ARTICLE_SELECT_COLS},
             ${vecExpr} AS vec_score,
             ${lexExpr} AS lex_score
           FROM articles
           ${filterSql}
         ),
         deduped AS (
           SELECT DISTINCT ON (LOWER(TRIM(COALESCE(title, link))), source)
             ${ARTICLE_SELECT_COLS},
             (${combinedExpr}) AS raw_score
           FROM scored
           ${relevanceGate}
           ORDER BY LOWER(TRIM(COALESCE(title, link))), source, (${combinedExpr}) DESC, date DESC
         )
         SELECT
           ${ARTICLE_SELECT_COLS},
           ROUND(raw_score::numeric, 3)::double precision AS score
         FROM deduped
         ORDER BY raw_score DESC, date DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        params
      );

      return res.rows.map((r) => mapRow(r, false));
    } catch (e) {
      console.warn('[DB] Postgres hybrid search failed, falling back to SQLite:', e);
    }
  }

  // Hybrid Search over SQLite (Vector cosine similarity + Lexical keyword boost across ALL rows)
  const sqlite = getSqliteDb();
  if (!sqlite) return [];

  try {
    const conditions: string[] = [`COALESCE(a.category, 'lab') = ?`];
    const params: any[] = [category];
    if (sourceFilter) {
      conditions.push(`a.source = ?`);
      params.push(sourceFilter);
    }
    if (primaryCategory) {
      conditions.push(`a.primary_category = ?`);
      params.push(primaryCategory);
    }
    if (startDate) {
      conditions.push(`a.date >= ?`);
      params.push(startDate.toISOString());
    }
    const whereSql = `WHERE ${conditions.join(' AND ')}`;

    const rows = sqlite
      .prepare(
        `SELECT a.title, a.link, a.date, a.source, a.snippet, a.tags, a.embedding,
                COALESCE(c.summary, a.summary) as summary,
                COALESCE(c.key_innovation, a.key_innovation) as key_innovation,
                COALESCE(c.significance, a.significance) as significance,
                a.category, a.authors, a.arxiv_id, a.pdf_url, a.venue,
                a.primary_category, a.abstract, a.citation_count
         FROM articles a
         LEFT JOIN cached_summaries c ON a.link = c.link
         ${whereSql}
         ORDER BY a.date DESC`
      )
      .all(...params);

    const scored: Article[] = [];

    for (const row of rows) {
      let vecScore = 0;
      let lexScore = 0;

      if (queryEmbedding && row.embedding) {
        const rowEmb = parseEmbedding(row.embedding);
        if (rowEmb) {
          vecScore = Math.max(0, cosineSimilarity(queryEmbedding, rowEmb));
        }
      }

      if (cleanQuery) {
        const titleLower = (row.title || '').toLowerCase();
        const bodyLower = (row.abstract || row.snippet || '').toLowerCase();
        const summaryLower = (row.summary || '').toLowerCase();
        const tagsLower = (row.tags || '').toLowerCase();
        const metaLower = `${row.source || ''} ${row.authors || ''} ${row.arxiv_id || ''}`.toLowerCase();

        if (titleLower.includes(cleanQuery)) lexScore += 0.45;
        if (tagsLower.includes(cleanQuery)) lexScore += 0.30;
        if (bodyLower.includes(cleanQuery)) lexScore += 0.18;
        if (summaryLower.includes(cleanQuery)) lexScore += 0.16;
        if (metaLower.includes(cleanQuery)) lexScore += 0.25;

        let matchedTerms = 0;
        for (const term of terms) {
          if (titleLower.includes(term)) {
            lexScore += 0.16;
            matchedTerms++;
          } else if (tagsLower.includes(term)) {
            lexScore += 0.10;
            matchedTerms++;
          } else if (bodyLower.includes(term) || metaLower.includes(term)) {
            lexScore += 0.05;
            matchedTerms++;
          }
        }

        if (terms.length > 1 && matchedTerms === terms.length) {
          lexScore += 0.15;
        }
      }

      const passesGate = cleanQuery ? lexScore > 0 || vecScore >= 0.56 : vecScore >= 0.30;
      if (passesGate) {
        const combined = queryEmbedding ? vecScore * 0.62 + lexScore : lexScore;
        const mapped = mapRow(row, false);
        mapped.score = Math.min(0.99, Number(combined.toFixed(3)));
        scored.push(mapped);
      }
    }

    scored.sort((a, b) => {
      const diff = (b.score ?? 0) - (a.score ?? 0);
      if (Math.abs(diff) > 0.0005) return diff;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    const seenTitleSource = new Set<string>();
    const deduped = scored.filter((a) => {
      const key = `${(a.title || a.link).trim().toLowerCase()}|${a.source}`;
      if (seenTitleSource.has(key)) return false;
      seenTitleSource.add(key);
      return true;
    });
    return deduped.slice(offset, offset + limit);
  } catch (e) {
    console.error('[DB] Hybrid search error:', e);
    return [];
  }
}

export async function searchAcademicPapers(options: {
  query: string;
  queryEmbedding: number[] | null;
  limit?: number;
  primaryCategory?: string;
  startDate?: Date;
  offset?: number;
}): Promise<AcademicPaper[]> {
  const rows = await searchArticlesHybrid(
    options.query,
    options.queryEmbedding,
    options.limit ?? 30,
    undefined,
    options.startDate,
    options.offset ?? 0,
    'academic',
    options.primaryCategory
  );
  return rows as AcademicPaper[];
}

export async function searchArticlesVector(
  queryEmbedding: number[],
  limit = 100
): Promise<Article[]> {
  return searchArticlesHybrid('', queryEmbedding, limit);
}

// ---------------------------------------------------------------------------
// getArticlesByDateRange (strictly Lab articles by default)
// ---------------------------------------------------------------------------
export async function getArticlesByDateRange(
  startDate: Date,
  endDate: Date,
  category: ArticleCategory = 'lab'
): Promise<Article[]> {
  if (await isPostgresAvailable()) {
    try {
      const pool = getPgPool();
      const res = await pool.query(
        `SELECT ${ARTICLE_SELECT_COLS}
         FROM articles
         WHERE COALESCE(category, 'lab') = $3 AND date >= $1 AND date <= $2
         ORDER BY date DESC`,
        [startDate.toISOString(), endDate.toISOString(), category]
      );
      return res.rows.map((r) => mapRow(r, false));
    } catch (e) {
      console.error('[DB] Postgres getArticlesByDateRange error:', e);
    }
  }

  const sqlite = getSqliteDb();
  if (!sqlite) return [];
  const rows = sqlite
    .prepare(
      `SELECT ${ARTICLE_SELECT_COLS}
       FROM articles
       WHERE COALESCE(category, 'lab') = ? AND date >= ? AND date <= ?
       ORDER BY date DESC`
    )
    .all(category, startDate.toISOString(), endDate.toISOString());
  return rows.map((r: any) => mapRow(r, false));
}

// ---------------------------------------------------------------------------
// getRandomArticle
// ---------------------------------------------------------------------------
export async function getRandomArticle(startDate: Date): Promise<Article | null> {
  const articles = await getArticles(100, startDate);
  if (articles.length === 0) {
    const all = await getArticles(100);
    if (all.length === 0) return null;
    return all[Math.floor(Math.random() * all.length)];
  }
  return articles[Math.floor(Math.random() * articles.length)];
}

// ---------------------------------------------------------------------------
// Summary Caching (Eliminates redundant web scraping & LLM calls)
// ---------------------------------------------------------------------------
export async function getCachedSummary(link: string): Promise<{
  summary: string;
  keyInnovation?: string;
  significance?: string;
  topics?: string[];
} | null> {
  const sqlite = getSqliteDb();
  if (!sqlite) return null;
  try {
    const row = sqlite
      .prepare(`SELECT summary, key_innovation, significance, topics FROM cached_summaries WHERE link = ?`)
      .get(link);
    if (row && row.summary) {
      return {
        summary: row.summary,
        keyInnovation: row.key_innovation,
        significance: row.significance,
        topics: parseTags(row.topics),
      };
    }
  } catch {}
  return null;
}

export async function saveCachedSummary(
  link: string,
  data: { summary: string; keyInnovation?: string; significance?: string; topics?: string[] }
): Promise<void> {
  const sqlite = getSqliteDb();
  if (sqlite) {
    try {
      sqlite
        .prepare(
          `INSERT INTO cached_summaries (link, summary, key_innovation, significance, topics, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(link) DO UPDATE SET
             summary = excluded.summary,
             key_innovation = excluded.key_innovation,
             significance = excluded.significance,
             topics = excluded.topics,
             updated_at = CURRENT_TIMESTAMP`
        )
        .run(
          link,
          data.summary,
          data.keyInnovation || '',
          data.significance || 'incremental',
          JSON.stringify(data.topics || [])
        );
    } catch (e) {
      console.error('[DB] Failed to cache summary in SQLite:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// DB Stats & Telemetry for Recursive Self-Improvement (strict Lab vs Academic split)
// ---------------------------------------------------------------------------
export async function getDBStats(): Promise<DBStats> {
  const isPg = await isPostgresAvailable();
  const sqlite = getSqliteDb();

  if (isPg) {
    try {
      const pool = getPgPool();
      const [aggRes, srcRes, acadCatRes] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE COALESCE(category, 'lab') = 'lab')::int AS total_lab,
            COUNT(*) FILTER (WHERE category = 'academic')::int AS total_academic,
            COUNT(*) FILTER (WHERE COALESCE(category, 'lab') = 'lab' AND embedding IS NOT NULL)::int AS embedded_lab,
            COUNT(*) FILTER (WHERE category = 'academic' AND embedding IS NOT NULL)::int AS embedded_academic,
            COUNT(*) FILTER (WHERE COALESCE(category, 'lab') = 'lab' AND tags IS NOT NULL AND tags != '[]' AND tags != '')::int AS tagged_lab,
            COUNT(*) FILTER (WHERE COALESCE(category, 'lab') = 'lab' AND date >= '2026-01-01')::int AS lab_2026
          FROM articles
        `),
        pool.query(`SELECT source, COUNT(*)::int AS c FROM articles WHERE COALESCE(category, 'lab') = 'lab' GROUP BY source`),
        pool.query(`SELECT COALESCE(primary_category, 'cs.AI') AS cat, COUNT(*)::int AS c FROM articles WHERE category = 'academic' GROUP BY COALESCE(primary_category, 'cs.AI')`),
      ]);
      const agg = aggRes.rows[0] || {};
      const sourceCounts: Record<string, number> = {};
      for (const r of srcRes.rows) {
        if (r.source) sourceCounts[r.source] = r.c;
      }
      const academicCategoryCounts: Record<string, number> = {};
      for (const r of acadCatRes.rows) {
        if (r.cat) academicCategoryCounts[r.cat] = r.c;
      }
      const cachedSummaries = sqlite
        ? sqlite.prepare(`SELECT count(*) as c FROM cached_summaries`).get()?.c || 0
        : 0;

      return {
        engine: 'postgres',
        totalArticles: agg.total_lab || 0,
        totalAcademicPapers: agg.total_academic || 0,
        embeddedArticles: agg.embedded_lab || 0,
        academicEmbeddedCount: agg.embedded_academic || 0,
        taggedArticles: agg.tagged_lab || 0,
        cachedSummaries,
        articles2026Count: agg.lab_2026 || 0,
        gcsArchiveStatus: 'active (gs://ai-research-pulse-assets/archive/articles-master.json)',
        sourceCounts,
        academicCategoryCounts,
      };
    } catch (e) {
      console.warn('[DB] Postgres stats failed, falling back to SQLite:', e);
    }
  }

  if (sqlite) {
    try {
      const total =
        sqlite.prepare(`SELECT count(*) as c FROM articles WHERE COALESCE(category, 'lab') = 'lab'`).get()?.c || 0;
      const totalAcademic =
        sqlite.prepare(`SELECT count(*) as c FROM articles WHERE category = 'academic'`).get()?.c || 0;
      const embedded =
        sqlite
          .prepare(
            `SELECT count(*) as c FROM articles WHERE COALESCE(category, 'lab') = 'lab' AND embedding IS NOT NULL AND embedding != ''`
          )
          .get()?.c || 0;
      const academicEmbedded =
        sqlite
          .prepare(
            `SELECT count(*) as c FROM articles WHERE category = 'academic' AND embedding IS NOT NULL AND embedding != ''`
          )
          .get()?.c || 0;
      const tagged =
        sqlite
          .prepare(
            `SELECT count(*) as c FROM articles WHERE COALESCE(category, 'lab') = 'lab' AND tags IS NOT NULL AND tags != '[]' AND tags != ''`
          )
          .get()?.c || 0;
      const summaries = sqlite.prepare(`SELECT count(*) as c FROM cached_summaries`).get()?.c || 0;
      const count2026 =
        sqlite
          .prepare(`SELECT count(*) as c FROM articles WHERE COALESCE(category, 'lab') = 'lab' AND date >= '2026-01-01'`)
          .get()?.c || 0;
      const sourceRows = sqlite
        .prepare(`SELECT source, count(*) as c FROM articles WHERE COALESCE(category, 'lab') = 'lab' GROUP BY source`)
        .all();
      const sourceCounts: Record<string, number> = {};
      for (const r of sourceRows) {
        if (r.source) sourceCounts[r.source] = r.c;
      }
      const acadCatRows = sqlite
        .prepare(
          `SELECT COALESCE(primary_category, 'cs.AI') as cat, count(*) as c FROM articles WHERE category = 'academic' GROUP BY COALESCE(primary_category, 'cs.AI')`
        )
        .all();
      const academicCategoryCounts: Record<string, number> = {};
      for (const r of acadCatRows) {
        if (r.cat) academicCategoryCounts[r.cat] = r.c;
      }

      return {
        engine: isPg ? 'postgres' : 'sqlite-fallback',
        totalArticles: total,
        totalAcademicPapers: totalAcademic,
        embeddedArticles: embedded,
        academicEmbeddedCount: academicEmbedded,
        taggedArticles: tagged,
        cachedSummaries: summaries,
        articles2026Count: count2026,
        gcsArchiveStatus: 'active (gs://ai-research-pulse-assets/archive/articles-master.json)',
        sourceCounts,
        academicCategoryCounts,
      };
    } catch (e) {
      console.error('[DB] Stats error:', e);
    }
  }

  return {
    engine: isPg ? 'postgres' : 'sqlite-fallback',
    totalArticles: 0,
    totalAcademicPapers: 0,
    embeddedArticles: 0,
    academicEmbeddedCount: 0,
    taggedArticles: 0,
    cachedSummaries: 0,
    articles2026Count: 0,
    gcsArchiveStatus: 'active',
    sourceCounts: {},
    academicCategoryCounts: {},
  };
}

export async function logSelfImprovementRun(entry: {
  modelUsed: string;
  action: string;
  metricsBefore: any;
  metricsAfter: any;
  notes: string;
}): Promise<void> {
  const sqlite = getSqliteDb();
  if (!sqlite) return;
  try {
    sqlite
      .prepare(
        `INSERT INTO self_improvement_logs (timestamp, model_used, action, metrics_before, metrics_after, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        new Date().toISOString(),
        entry.modelUsed,
        entry.action,
        JSON.stringify(entry.metricsBefore),
        JSON.stringify(entry.metricsAfter),
        entry.notes
      );
  } catch {}
}

export async function getSelfImprovementLogs(limit = 10): Promise<any[]> {
  const sqlite = getSqliteDb();
  if (!sqlite) return [];
  try {
    return sqlite
      .prepare(`SELECT * FROM self_improvement_logs ORDER BY id DESC LIMIT ?`)
      .all(limit)
      .map((r: any) => ({
        ...r,
        metricsBefore: JSON.parse(r.metrics_before || '{}'),
        metricsAfter: JSON.parse(r.metrics_after || '{}'),
      }));
  } catch {
    return [];
  }
}
