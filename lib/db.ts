import { Pool } from 'pg';

// Use environment variables for connection
// Ensure these are set in .env.local
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432,
  ssl: process.env.NODE_ENV === 'production' && !process.env.POSTGRES_HOST?.startsWith('/cloudsql/') 
    ? { rejectUnauthorized: false } 
    : undefined,
});

// Initialize DB
async function initDB() {
  const client = await pool.connect();
  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS articles (
        link TEXT PRIMARY KEY,
        title TEXT,
        date TIMESTAMP WITH TIME ZONE,
        source TEXT,
        snippet TEXT,
        tags TEXT, -- Stored as JSON string
        embedding vector(768), -- Vertex AI embedding dimension
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Error initializing DB:', err);
  } finally {
    client.release();
  }
}

// Call init on import (or better, call it explicitly in app startup)
// For now, we'll let it run, but in serverless this might be tricky.
// In Next.js, this might run on every cold start.
initDB().catch(console.error);

export interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI' | 'x.AI';
  snippet: string;
  tags?: string[];
  embedding?: number[];
  score?: number;
}

export async function saveArticles(articles: Article[]) {
  if (articles.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const query = `
      INSERT INTO articles (link, title, date, source, snippet, tags, embedding)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(link) DO UPDATE SET
        tags = EXCLUDED.tags,
        embedding = EXCLUDED.embedding,
        title = EXCLUDED.title,
        snippet = EXCLUDED.snippet,
        date = EXCLUDED.date
    `;

    let count = 0;
    for (const article of articles) {
      try {
        await client.query(query, [
          article.link,
          article.title,
          article.date,
          article.source,
          article.snippet,
          article.tags ? JSON.stringify(article.tags) : '[]',
          article.embedding ? JSON.stringify(article.embedding) : null // pgvector handles JSON array as vector input often, or string '[...]'
        ]);
        count++;
      } catch (err) {
        console.error(`Failed to save article ${article.title}:`, err);
      }
    }
    
    await client.query('COMMIT');
    console.log(`[DB] Successfully upserted ${count} articles.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[DB] Error in saveArticles:', e);
  } finally {
    client.release();
  }
}

export async function getArticles(limit = 100, startDate?: Date, offset = 0): Promise<Article[]> {
  try {
    let query = `
      SELECT title, link, date, source, snippet, tags, embedding::text
      FROM articles 
    `;
    const params: any[] = [limit];

    if (startDate) {
      query += ` WHERE date >= $2 `;
      params.push(startDate.toISOString());
    }

    // Add offset
    if (offset > 0) {
      query += ` ORDER BY date DESC LIMIT $1 OFFSET $${params.length + 1}`;
      params.push(offset);
    } else {
      query += ` ORDER BY date DESC LIMIT $1`;
    }

    const res = await pool.query(query, params);
    
    return res.rows.map(row => ({
      ...row,
      date: row.date.toISOString(), // Ensure ISO string for frontend
      tags: row.tags ? JSON.parse(row.tags) : [],
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined
    }));
  } catch (e) {
    console.error('[DB] Error in getArticles:', e);
    return [];
  }
}

export async function getAllArticlesForSearch(): Promise<Article[]> {
  try {
    const res = await pool.query(`
      SELECT title, link, date, source, snippet, tags, embedding::text
      FROM articles 
      ORDER BY date DESC
    `);
    
    return res.rows.map(row => ({
      ...row,
      date: row.date.toISOString(),
      tags: row.tags ? JSON.parse(row.tags) : [],
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined
    }));
  } catch (e) {
    console.error('[DB] Error in getAllArticlesForSearch:', e);
    return [];
  }
}

// New function for vector search directly in DB
export async function searchArticlesVector(queryEmbedding: number[], limit = 100): Promise<Article[]> {
  try {
    // Cosine distance operator is <=>
    // We want similarity, so we order by distance ASC
    const res = await pool.query(`
      SELECT title, link, date, source, snippet, tags, embedding::text,
             1 - (embedding <=> $1) as score
      FROM articles
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1 ASC
      LIMIT $2
    `, [JSON.stringify(queryEmbedding), limit]);

    return res.rows.map(row => ({
      ...row,
      date: row.date.toISOString(),
      tags: row.tags ? JSON.parse(row.tags) : [],
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined
    }));
  } catch (e) {
    console.error('[DB] Error in searchArticlesVector:', e);
    return [];
  }
}

export async function getArticlesByDateRange(startDate: Date, endDate: Date): Promise<Article[]> {
  try {
    const res = await pool.query(`
      SELECT title, link, date, source, snippet, tags, embedding::text
      FROM articles 
      WHERE date >= $1 AND date <= $2
      ORDER BY date DESC
    `, [startDate.toISOString(), endDate.toISOString()]);
    
    return res.rows.map(row => ({
      ...row,
      date: row.date.toISOString(),
      tags: row.tags ? JSON.parse(row.tags) : [],
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined
    }));
  } catch (e) {
    console.error('[DB] Error in getArticlesByDateRange:', e);
    return [];
  }
}

export async function getRandomArticle(startDate: Date): Promise<Article | null> {
  try {
    const res = await pool.query(`
      SELECT title, link, date, source, snippet, tags, embedding::text
      FROM articles 
      WHERE date >= $1
      ORDER BY RANDOM()
      LIMIT 1
    `, [startDate.toISOString()]);
    
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      ...row,
      date: row.date.toISOString(),
      tags: row.tags ? JSON.parse(row.tags) : [],
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined
    };
  } catch (e) {
    console.error('[DB] Error in getRandomArticle:', e);
    return null;
  }
}
