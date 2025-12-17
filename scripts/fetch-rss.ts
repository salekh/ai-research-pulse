import Parser from 'rss-parser';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import { RSS_FEEDS } from '../lib/rss-config';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

const parser = new Parser();

import { filterTechnicalArticles } from '../lib/content-filter';
import { Article } from '../lib/db';

// ... (imports)

async function fetchAndSaveRSS() {
  const client = await pool.connect();
  try {
    console.log('Starting RSS fetch...');
    
    for (const feed of RSS_FEEDS) {
      console.log(`Fetching ${feed.source}...`);
      try {
        const parsed = await parser.parseURL(feed.url);
        console.log(`Found ${parsed.items.length} items for ${feed.source}`);

        const newArticles: Article[] = [];

        for (const item of parsed.items) {
          const title = item.title;
          const link = item.link;
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          const snippet = item.contentSnippet || item.content || '';

          if (!title || !link) continue;

          // Check if exists
          const checkRes = await client.query('SELECT 1 FROM articles WHERE link = $1', [link]);
          if (checkRes.rowCount && checkRes.rowCount > 0) {
            continue; // Skip existing
          }

          newArticles.push({
            title,
            link,
            date: pubDate.toISOString(),
            source: feed.source as any,
            snippet: snippet.substring(0, 500)
          });
        }

        if (newArticles.length > 0) {
          console.log(`Filtering ${newArticles.length} new candidates for ${feed.source}...`);
          const validArticles = await filterTechnicalArticles(newArticles);
          console.log(`Saving ${validArticles.length} valid technical articles...`);

          for (const article of validArticles) {
            await client.query(`
              INSERT INTO articles (title, link, date, source, snippet, created_at)
              VALUES ($1, $2, $3, $4, $5, NOW())
            `, [article.title, article.link, article.date, article.source, article.snippet]);
          }
        }

      } catch (err) {
        console.error(`Error fetching ${feed.source}:`, err);
      }
    }
    console.log('RSS fetch complete.');
  } catch (e) {
    console.error('Database error:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

fetchAndSaveRSS();
