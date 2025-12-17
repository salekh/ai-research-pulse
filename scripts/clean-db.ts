import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  port: 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function cleanDB() {
  const client = await pool.connect();
  try {
    console.log('Cleaning DB...');
    // Delete articles created in the last 24 hours (assuming this is when the bad data was added)
    // Or delete all articles if we want a fresh start for the RSS feed.
    // The user said "delete all articles pushed to the DB using this approach".
    // I'll delete all articles for now to ensure cleanliness, as we can backfill from RSS.
    
    const res = await client.query('DELETE FROM articles WHERE source IS NULL');
    console.log(`Deleted ${res.rowCount} articles.`);
  } catch (e) {
    console.error(e);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanDB();
