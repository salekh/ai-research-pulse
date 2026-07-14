import { NextResponse } from 'next/server';
import { getArticles, searchArticlesVector, Article } from '@/lib/db';
import { getEmbedding } from '@/lib/vertex';
import { ingestAll } from '@/lib/ingestion';
import { rerankArticles } from '@/lib/reranker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const refresh = searchParams.get('refresh') === 'true';
  const timeRange = searchParams.get('timeRange') || '2w';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 30;
  const offset = (page - 1) * limit;

  try {
    // Trigger full ingestion if explicitly requested
    if (refresh) {
      await ingestAll(true);
    }

    // Compute the start-date filter
    let startDate: Date | undefined;
    if (timeRange !== 'all') {
      const now = new Date();
      startDate = new Date(now);
      switch (timeRange) {
        case '2w':
          startDate.setDate(now.getDate() - 14);
          break;
        case '1m':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 14);
      }
    }

    let articles: Article[];

    if (query) {
      // Vector search — ignores time range to give best semantic matches across all time
      const queryEmbedding = await getEmbedding(query);

      if (queryEmbedding) {
        articles = await searchArticlesVector(queryEmbedding, limit);
        articles = await rerankArticles(query, articles);
      } else {
        // Fallback to recency-based results if embedding fails
        articles = await getArticles(limit, startDate, offset);
      }
    } else {
      articles = await getArticles(limit, startDate, offset);
    }

    return NextResponse.json({ articles, hasMore: articles.length === limit });
  } catch (error) {
    console.error('[api/news] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
