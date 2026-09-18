import { NextResponse } from 'next/server';
import { getArticles, searchArticlesHybrid, Article, getDBStats } from '@/lib/db';
import { getEmbedding, getAITelemetry } from '@/lib/vertex';
import { ingestAll } from '@/lib/ingestion';
import { rerankArticles } from '@/lib/reranker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const refresh = searchParams.get('refresh') === 'true';
  const timeRange = searchParams.get('timeRange') || '2w';
  const sourceFilter = searchParams.get('source') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '30', 10);
  const limit = Math.min(Math.max(rawLimit, 1), 5000);
  const offset = (page - 1) * limit;

  try {
    // Non-blocking background refresh if explicitly requested (with 15-min server cooldown)
    if (refresh) {
      ingestAll(false).catch((e) => console.error('[api/news] Background ingest error:', e));
    }

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

    if (query && query.trim()) {
      const queryEmbedding = await getEmbedding(query);
      articles = await searchArticlesHybrid(query, queryEmbedding, limit, sourceFilter);
      if (queryEmbedding && articles.length > 1) {
        articles = await rerankArticles(query, articles);
      }
    } else {
      articles = await getArticles(limit, startDate, offset, sourceFilter);
      // If 2w/1m filter yields 0 articles (e.g. historical dataset), fall back to all time automatically
      if (articles.length === 0 && startDate && page === 1) {
        articles = await getArticles(limit, undefined, offset, sourceFilter);
      }
    }

    const stats = await getDBStats();
    const telemetry = getAITelemetry();

    return NextResponse.json({
      articles,
      hasMore: articles.length === limit,
      meta: {
        engine: stats.engine,
        totalIndexed: stats.totalArticles,
        model: telemetry.activeModel,
      },
    });
  } catch (error) {
    console.error('[api/news] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
