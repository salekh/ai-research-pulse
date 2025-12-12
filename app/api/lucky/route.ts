import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data/news.db');

export async function GET() {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Calculate date 3 months ago
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateStr = threeMonthsAgo.toISOString();

    // Get random article newer than 3 months
    const stmt = db.prepare(`
      SELECT link FROM articles 
      WHERE date >= ? 
      ORDER BY RANDOM() 
      LIMIT 1
    `);
    
    const article = stmt.get(dateStr) as { link: string } | undefined;

    if (article) {
      return NextResponse.redirect(article.link);
    } else {
      // Fallback if no recent articles (unlikely)
      return NextResponse.redirect(new URL('/', 'http://localhost:3000').toString());
    }
  } catch (error) {
    console.error('Error in I\'m Feeling Lucky:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
