import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'news.db');
const db = new Database(dbPath);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    link TEXT PRIMARY KEY,
    title TEXT,
    date TEXT,
    source TEXT,
    snippet TEXT,
    tags TEXT,
    embedding TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration helper (simple check to add columns if they don't exist)
try {
  db.exec(`ALTER TABLE articles ADD COLUMN tags TEXT`);
} catch (e) { /* ignore if exists */ }
try {
  db.exec(`ALTER TABLE articles ADD COLUMN embedding TEXT`);
} catch (e) { /* ignore if exists */ }

export interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI';
  snippet: string;
  tags?: string[];
  embedding?: number[];
  score?: number;
}

export function saveArticles(articles: Article[]) {
  const insert = db.prepare(`
    INSERT INTO articles (link, title, date, source, snippet, tags, embedding)
    VALUES (@link, @title, @date, @source, @snippet, @tags, @embedding)
    ON CONFLICT(link) DO UPDATE SET
      tags = excluded.tags,
      embedding = excluded.embedding,
      title = excluded.title,
      snippet = excluded.snippet,
      date = excluded.date
  `);

  const insertMany = db.transaction((articles: Article[]) => {
    for (const article of articles) {
      insert.run({
        ...article,
        tags: article.tags ? JSON.stringify(article.tags) : '[]',
        embedding: article.embedding ? JSON.stringify(article.embedding) : null
      });
    }
  });

  insertMany(articles);
}

export function getArticles(limit = 100): Article[] {
  const stmt = db.prepare(`
    SELECT title, link, date, source, snippet, tags, embedding
    FROM articles 
    ORDER BY date DESC 
    LIMIT ?
  `);
  const rows = stmt.all(limit) as any[];
  return rows.map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined
  }));
}

export function getAllArticlesForSearch(): Article[] {
  const stmt = db.prepare(`
    SELECT title, link, date, source, snippet, tags, embedding
    FROM articles 
    ORDER BY date DESC
  `);
  const rows = stmt.all() as any[];
  return rows.map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    embedding: row.embedding ? JSON.parse(row.embedding) : undefined
  }));
}
