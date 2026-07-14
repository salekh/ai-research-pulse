import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432,
  // Only use SSL in production when NOT connecting via a Cloud SQL Unix socket
  ssl:
    process.env.NODE_ENV === 'production' &&
    !process.env.POSTGRES_HOST?.startsWith('/cloudsql/')
      ? { rejectUnauthorized: false }
      : undefined,
});

// ---------------------------------------------------------------------------
// Lazy initialisation — runs once regardless of how many cold starts occur
// ---------------------------------------------------------------------------
let initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS vector');
        await client.query(`
          CREATE TABLE IF NOT EXISTS articles (
            link        TEXT PRIMARY KEY,
            title       TEXT,
            date        TIMESTAMP WITH TIME ZONE,
            source      TEXT,
            snippet     TEXT,
            tags        TEXT,             -- stored as JSON string
            embedding   vector(768),      -- Vertex AI text-embedding-004 dimension
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } finally {
        client.release();
      }
    })().catch((err) => {
      // Reset so the next call can retry
      initPromise = null;
      console.error('[DB] initDB error:', err);
      throw err;
    });
  }
  return initPromise;
}

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapRow(row: any): Article {
  return {
    ...row,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    tags: row.tags ? JSON.parse(row.tags) : [],
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
  };
}

// ---------------------------------------------------------------------------
// saveArticles — bulk UNNEST upsert (single round-trip to Postgres)
// ---------------------------------------------------------------------------
export async function saveArticles(articles: Article[]): Promise<void> {
  if (articles.length === 0) return;
  await ensureInit();

  const links: string[]   = [];
  const titles: string[]  = [];
  const dates: string[]   = [];
  const sources: string[] = [];
  const snippets: string[]= [];
  const tags: string[]    = [];
  const embeddings: (string | null)[] = [];

  for (const a of articles) {
    links.push(a.link);
    titles.push(a.title);
    dates.push(a.date);
    sources.push(a.source);
    snippets.push(a.snippet);
    tags.push(a.tags ? JSON.stringify(a.tags) : '[]');
    embeddings.push(a.embedding ? JSON.stringify(a.embedding) : null);
  }

  const client = await pool.connect();
  try {
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
        embedding = EXCLUDED.embedding
      `,
      [links, titles, dates, sources, snippets, tags, embeddings],
    );
    console.log(`[DB] Upserted ${articles.length} articles.`);
  } catch (e) {
    console.error('[DB] saveArticles error:', e);
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getArticles — paginated, optionally filtered by start date
// ---------------------------------------------------------------------------
export async function getArticles(
  limit = 100,
  startDate?: Date,
  offset = 0,
): Promise<Article[]> {
  await ensureInit();
  try {
    const params: any[] = [limit, offset];
    const whereClause = startDate
      ? `WHERE date >= $3`
      : '';
    if (startDate) params.push(startDate.toISOString());

    const res = await pool.query(
      `SELECT title, link, date, source, snippet, tags, embedding::text
       FROM articles
       ${whereClause}
       ORDER BY date DESC
       LIMIT $1 OFFSET $2`,
      params,
    );
    return res.rows.map(mapRow);
  } catch (e) {
    console.error('[DB] getArticles error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getAllArticlesForSearch
// ---------------------------------------------------------------------------
export async function getAllArticlesForSearch(): Promise<Article[]> {
  await ensureInit();
  try {
    const res = await pool.query(
      `SELECT title, link, date, source, snippet, tags, embedding::text
       FROM articles
       ORDER BY date DESC`,
    );
    return res.rows.map(mapRow);
  } catch (e) {
    console.error('[DB] getAllArticlesForSearch error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// searchArticlesVector — cosine similarity via pgvector
// ---------------------------------------------------------------------------
export async function searchArticlesVector(
  queryEmbedding: number[],
  limit = 100,
): Promise<Article[]> {
  await ensureInit();
  try {
    const res = await pool.query(
      `SELECT title, link, date, source, snippet, tags, embedding::text,
              1 - (embedding <=> $1) AS score
       FROM articles
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1 ASC
       LIMIT $2`,
      [JSON.stringify(queryEmbedding), limit],
    );
    return res.rows.map(mapRow);
  } catch (e) {
    console.error('[DB] searchArticlesVector error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getArticlesByDateRange
// ---------------------------------------------------------------------------
export async function getArticlesByDateRange(
  startDate: Date,
  endDate: Date,
): Promise<Article[]> {
  await ensureInit();
  try {
    const res = await pool.query(
      `SELECT title, link, date, source, snippet, tags, embedding::text
       FROM articles
       WHERE date >= $1 AND date <= $2
       ORDER BY date DESC`,
      [startDate.toISOString(), endDate.toISOString()],
    );
    return res.rows.map(mapRow);
  } catch (e) {
    console.error('[DB] getArticlesByDateRange error:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getRandomArticle
// ---------------------------------------------------------------------------
export async function getRandomArticle(startDate: Date): Promise<Article | null> {
  await ensureInit();
  try {
    const res = await pool.query(
      `SELECT title, link, date, source, snippet, tags, embedding::text
       FROM articles
       WHERE date >= $1
       ORDER BY RANDOM()
       LIMIT 1`,
      [startDate.toISOString()],
    );
    if (res.rows.length === 0) return null;
    return mapRow(res.rows[0]);
  } catch (e) {
    console.error('[DB] getRandomArticle error:', e);
    return null;
  }
}
