import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { Pool } from 'pg';
import { filterTechnicalArticles } from '../lib/content-filter';
import { Article } from '../lib/db';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Fetching all articles...');
    const res = await client.query('SELECT * FROM articles');
    const allArticles: Article[] = res.rows.map(row => ({
      ...row,
      date: row.date.toISOString(),
      tags: row.tags ? JSON.parse(row.tags) : [],
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined
    }));

    console.log(`Found ${allArticles.length} articles. Filtering...`);
    
    const validArticles = await filterTechnicalArticles(allArticles);
    const validLinks = new Set(validArticles.map(a => a.link));
    
    const articlesToDelete = allArticles.filter(a => !validLinks.has(a.link));
    
    console.log(`Kept ${validArticles.length} articles.`);
    console.log(`Deleting ${articlesToDelete.length} non-technical articles...`);

    if (articlesToDelete.length > 0) {
      // Delete in batches or one by one? One by one is safer for now or WHERE link IN (...)
      // Let's use WHERE link IN (...)
      const deleteLinks = articlesToDelete.map(a => a.link);
      
      // Postgres limit for parameters is 65535, but let's be safe with smaller batches
      const batchSize = 100;
      for (let i = 0; i < deleteLinks.length; i += batchSize) {
        const batch = deleteLinks.slice(i, i + batchSize);
        const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');
        await client.query(`DELETE FROM articles WHERE link IN (${placeholders})`, batch);
      }
      console.log('Deletion complete.');
    }

  } catch (e) {
    console.error(e);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
