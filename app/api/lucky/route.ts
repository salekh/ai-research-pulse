import { NextResponse } from 'next/server';
import { getRandomArticle } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const article = await getRandomArticle(threeMonthsAgo);

    if (article) {
      return NextResponse.redirect(article.link);
    }

    // Derive base URL from the incoming request — works in any environment (local, Cloud Run, etc.)
    const { origin } = new URL(request.url);
    return NextResponse.redirect(`${origin}/`);
  } catch (error) {
    console.error("[api/lucky] Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
