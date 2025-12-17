import { NextResponse } from 'next/server';
import { getRandomArticle } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Calculate date 3 months ago
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const article = await getRandomArticle(threeMonthsAgo);

    if (article) {
      return NextResponse.redirect(article.link);
    } else {
      // Fallback if no recent articles
      return NextResponse.redirect(new URL('/', 'http://localhost:3000').toString());
    }
  } catch (error) {
    console.error('Error in I\'m Feeling Lucky:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
