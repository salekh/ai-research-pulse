import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'news.db');
const db = new Database(dbPath);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    link TEXT PRIMARY KEY,
    title TEXT,
    date TEXT,
    source TEXT,
    snippet TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface Article {
  title: string;
  link: string;
  date: string;
  source: 'Google Research' | 'Google DeepMind' | 'OpenAI' | 'Anthropic' | 'Microsoft Research' | 'Meta AI';
  snippet: string;
}

export function saveArticles(articles: Article[]) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (link, title, date, source, snippet)
    VALUES (@link, @title, @date, @source, @snippet)
  `);

  const insertMany = db.transaction((articles: Article[]) => {
    for (const article of articles) {
      insert.run(article);
    }
  });

  insertMany(articles);
}

export function getArticles(limit = 100): Article[] {
  const stmt = db.prepare(`
    SELECT title, link, date, source, snippet 
    FROM articles 
    ORDER BY date DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as Article[];
}
