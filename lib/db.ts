import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Article {
  title: string;
  link: string;
  date: string;
  source:
    | 'Google Research'
    | 'Google DeepMind'
    | 'OpenAI'
    | 'Anthropic'
    | 'Microsoft Research'
    | 'Meta AI'
    | 'x.AI';
  snippet: string;
  tags?: string[];
  embedding?: number[];
  score?: number;
  summary?: string;
  keyInnovation?: string;
  significance?: string;
}

export interface DBStats {
  engine: 'postgres' | 'sqlite-fallback';
  totalArticles: number;
  embeddedArticles: number;
  taggedArticles: number;
  cachedSummaries: number;
  sourceCounts: Record<string, number>;
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
      for (const col of ['summary TEXT', 'key_innovation TEXT', 'significance TEXT']) {
        try {
          db.exec(`ALTER TABLE articles ADD COLUMN ${col};`);
        } catch {}
      }
      globalThis.__sqliteDb = db;
    } catch (e) {
      console.error('[DB] Failed to initialize node:sqlite fallback:', e);
    }
  }
  return globalThis.__sqliteDb;
}

// ---------------------------------------------------------------------------
// Engine Health State
// ---------------------------------------------------------------------------
let pgHealthy: boolean | null = null;
let lastPgCheck = 0;
const PG_RETRY_INTERVAL_MS = 60_000;

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
        CREATE INDEX IF NOT EXISTS idx_articles_date ON articles (date DESC);
        CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source);
      `);
      pgHealthy = true;
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
// ---------------------------------------------------------------------------
export async function saveArticles(articles: Article[]): Promise<void> {
  if (articles.length === 0) return;

  // Always mirror to SQLite so data/news.db stays enriched
  const sqlite = getSqliteDb();
  if (sqlite) {
    try {
      const stmt = sqlite.prepare(`
        INSERT INTO articles (link, title, date, source, snippet, tags, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(link) DO UPDATE SET
          title = excluded.title,
          date = excluded.date,
          snippet = excluded.snippet,
          tags = CASE WHEN excluded.tags != '[]' THEN excluded.tags ELSE articles.tags END,
          embedding = COALESCE(excluded.embedding, articles.embedding)
      `);
      for (const a of articles) {
        stmt.run(
          a.link,
          a.title,
          a.date,
          a.source,
          a.snippet,
          JSON.stringify(a.tags || []),
          a.embedding ? JSON.stringify(a.embedding) : null
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
      const links: string[] = [];
      const titles: string[] = [];
      const dates: string[] = [];
      const sources: string[] = [];
      const snippets: string[] = [];
      const tags: string[] = [];
      const embeddings: (string | null)[] = [];

      for (const a of articles) {
        links.push(a.link);
        titles.push(a.title);
        dates.push(a.date);
        sources.push(a.source);
        snippets.push(a.snippet);
        tags.push(JSON.stringify(a.tags || []));
        embeddings.push(a.embedding ? JSON.stringify(a.embedding) : null);
      }

      await client.query(
        `
        INSERT INTO articles (link, title, date, source, snippet, tags, embedding)
        SELECT
          unnest($1::text[]),
          unnest($2::text[]),
          unnest($3::timestamptz[]),
          unnest($4::text[]),
          unnest($5::text[]),
          unnest($6::text[]),
          unnest($7::text[])::vector
        ON CONFLICT (link) DO UPDATE SET
          title     = EXCLUDED.title,
          date      = EXCLUDED.date,
          snippet   = EXCLUDED.snippet,
          tags      = EXCLUDED.tags,
          embedding = COALESCE(EXCLUDED.embedding, articles.embedding)
        `,
        [links, titles, dates, sources, snippets, tags, embeddings]
      );
    } catch (e) {
      console.error('[DB] Postgres saveArticles error:', e);
    } finally {
      client.release();
    }
  }
}

// ---------------------------------------------------------------------------
// getArticles — Paginated & filtered, omits heavy embedding vector by default
// ---------------------------------------------------------------------------
export async function getArticles(
  limit = 100,
  startDate?: Date,
  offset = 0,
  sourceFilter?: string,
  includeEmbedding = false
): Promise<Article[]> {
  if (await isPostgresAvailable()) {
    try {
      const pool = getPgPool();
      const params: any[] = [limit, offset];
      const conditions: string[] = [];

      if (startDate) {
        params.push(startDate.toISOString());
        conditions.push(`date >= $${params.length}`);
      }
      if (sourceFilter) {
        params.push(sourceFilter);
        conditions.push(`source = $${params.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const embCol = includeEmbedding ? ', embedding::text' : '';

      const res = await pool.query(
        `SELECT title, link, date, source, snippet, tags, summary, key_innovation, significance${embCol}
         FROM articles
         ${whereClause}
         ORDER BY date DESC
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

    if (startDate) {
      conditions.push(`date >= ?`);
      params.push(startDate.toISOString());
    }
    if (sourceFilter) {
      conditions.push(`source = ?`);
      params.push(sourceFilter);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const embCol = includeEmbedding ? ', a.embedding' : '';
    const rows = sqlite
      .prepare(
        `SELECT a.title, a.link, a.date, a.source, a.snippet, a.tags${embCol},
                COALESCE(c.summary, a.summary) as summary,
                COALESCE(c.key_innovation, a.key_innovation) as key_innovation,
                COALESCE(c.significance, a.significance) as significance
         FROM articles a
         LEFT JOIN cached_summaries c ON a.link = c.link
         ${whereClause}
         ORDER BY a.date DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params);

    return rows.map((r: any) => mapRow(r, includeEmbedding));
  } catch (e) {
    console.error('[DB] SQLite getArticles error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// searchArticlesHybrid — Combines Vector Search + Lexical BM25-style ranking
// Works even when embeddings are partial or offline
// ---------------------------------------------------------------------------
export async function searchArticlesHybrid(
  query: string,
  queryEmbedding: number[] | null,
  limit = 50,
  sourceFilter?: string
): Promise<Article[]> {
  const cleanQuery = query.trim().toLowerCase();
  const terms = cleanQuery.split(/\s+/).filter((t) => t.length > 1);

  if (queryEmbedding && (await isPostgresAvailable())) {
    try {
      const pool = getPgPool();
      const params: any[] = [JSON.stringify(queryEmbedding), limit];
      const sourceCond = sourceFilter ? `AND source = $3` : '';
      if (sourceFilter) params.push(sourceFilter);

      const res = await pool.query(
        `SELECT title, link, date, source, snippet, tags, summary, key_innovation, significance,
                1 - (embedding <=> $1) AS score
         FROM articles
         WHERE embedding IS NOT NULL ${sourceCond}
         ORDER BY embedding <=> $1 ASC
         LIMIT $2`,
        params
      );
      if (res.rows.length > 0) {
        return res.rows.map((r) => mapRow(r, false));
      }
    } catch (e) {
      console.warn('[DB] Postgres vector search failed, using hybrid SQLite search:', e);
    }
  }

  // Hybrid Search over SQLite (Vector cosine similarity + Lexical keyword boost)
  const sqlite = getSqliteDb();
  if (!sqlite) return [];

  try {
    const sourceCond = sourceFilter ? `WHERE a.source = ?` : '';
    const rows = sqlite
      .prepare(
        `SELECT a.title, a.link, a.date, a.source, a.snippet, a.tags, a.embedding,
                COALESCE(c.summary, a.summary) as summary,
                COALESCE(c.key_innovation, a.key_innovation) as key_innovation,
                COALESCE(c.significance, a.significance) as significance
         FROM articles a
         LEFT JOIN cached_summaries c ON a.link = c.link
         ${sourceCond}
         ORDER BY a.date DESC
         LIMIT 1000`
      )
      .all(...(sourceFilter ? [sourceFilter] : []));

    const scored: Article[] = [];

    for (const row of rows) {
      let score = 0;

      // 1. Vector Similarity (if queryEmbedding & row embedding exist)
      if (queryEmbedding && row.embedding) {
        const rowEmb = parseEmbedding(row.embedding);
        if (rowEmb) {
          const sim = cosineSimilarity(queryEmbedding, rowEmb);
          score += Math.max(0, sim) * 0.65;
        }
      }

      // 2. Lexical BM25-style Keyword Boost (Title, Tags, Snippet)
      const titleLower = (row.title || '').toLowerCase();
      const snippetLower = (row.snippet || '').toLowerCase();
      const tagsLower = (row.tags || '').toLowerCase();

      if (titleLower.includes(cleanQuery)) score += 0.45;
      if (tagsLower.includes(cleanQuery)) score += 0.35;

      let matchedTerms = 0;
      for (const term of terms) {
        if (titleLower.includes(term)) {
          score += 0.18;
          matchedTerms++;
        } else if (tagsLower.includes(term)) {
          score += 0.12;
          matchedTerms++;
        } else if (snippetLower.includes(term)) {
          score += 0.06;
          matchedTerms++;
        }
      }

      if (terms.length > 0 && matchedTerms === terms.length) {
        score += 0.2; // Exact multi-term convergence bonus
      }

      if (score > 0.05) {
        const mapped = mapRow(row, false);
        mapped.score = Math.min(0.99, Number(score.toFixed(3)));
        scored.push(mapped);
      }
    }

    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored.slice(0, limit);
  } catch (e) {
    console.error('[DB] Hybrid search error:', e);
    return [];
  }
}

export async function searchArticlesVector(
  queryEmbedding: number[],
  limit = 100
): Promise<Article[]> {
  return searchArticlesHybrid('', queryEmbedding, limit);
}

// ---------------------------------------------------------------------------
// getArticlesByDateRange
// ---------------------------------------------------------------------------
export async function getArticlesByDateRange(
  startDate: Date,
  endDate: Date
): Promise<Article[]> {
  if (await isPostgresAvailable()) {
    try {
      const pool = getPgPool();
      const res = await pool.query(
        `SELECT title, link, date, source, snippet, tags
         FROM articles
         WHERE date >= $1 AND date <= $2
         ORDER BY date DESC`,
        [startDate.toISOString(), endDate.toISOString()]
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
      `SELECT title, link, date, source, snippet, tags
       FROM articles
       WHERE date >= ? AND date <= ?
       ORDER BY date DESC`
    )
    .all(startDate.toISOString(), endDate.toISOString());
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
// DB Stats & Telemetry for Recursive Self-Improvement
// ---------------------------------------------------------------------------
export async function getDBStats(): Promise<DBStats> {
  const isPg = await isPostgresAvailable();
  const sqlite = getSqliteDb();

  if (sqlite) {
    try {
      const total = sqlite.prepare(`SELECT count(*) as c FROM articles`).get()?.c || 0;
      const embedded =
        sqlite
          .prepare(`SELECT count(*) as c FROM articles WHERE embedding IS NOT NULL AND embedding != ''`)
          .get()?.c || 0;
      const tagged =
        sqlite
          .prepare(`SELECT count(*) as c FROM articles WHERE tags IS NOT NULL AND tags != '[]' AND tags != ''`)
          .get()?.c || 0;
      const summaries = sqlite.prepare(`SELECT count(*) as c FROM cached_summaries`).get()?.c || 0;
      const sourceRows = sqlite.prepare(`SELECT source, count(*) as c FROM articles GROUP BY source`).all();
      const sourceCounts: Record<string, number> = {};
      for (const r of sourceRows) {
        if (r.source) sourceCounts[r.source] = r.c;
      }

      return {
        engine: isPg ? 'postgres' : 'sqlite-fallback',
        totalArticles: total,
        embeddedArticles: embedded,
        taggedArticles: tagged,
        cachedSummaries: summaries,
        sourceCounts,
      };
    } catch (e) {
      console.error('[DB] Stats error:', e);
    }
  }

  return {
    engine: isPg ? 'postgres' : 'sqlite-fallback',
    totalArticles: 0,
    embeddedArticles: 0,
    taggedArticles: 0,
    cachedSummaries: 0,
    sourceCounts: {},
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
