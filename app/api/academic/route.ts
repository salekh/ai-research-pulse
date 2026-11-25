import { NextResponse } from 'next/server';
import { getAcademicPapers, searchAcademicPapers, getDBStats, AcademicPaper } from '@/lib/db';
import { getEmbedding, getAITelemetry } from '@/lib/vertex';
import { ingestLatestAcademicPapers } from '@/lib/academic-ingestion';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const refresh = searchParams.get('refresh') === 'true';
  const timeRange = searchParams.get('timeRange') || '6m';
  const track = searchParams.get('track') || undefined; // e.g. cs.AI, cs.LG, cs.CL, cs.CV, cs.RO
  const sortBy = searchParams.get('sort') === 'impact' ? 'impact' : 'latest';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const rawLimit = parseInt(searchParams.get('limit') || '24', 10);
  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const offset = (page - 1) * limit;

  try {
    if (refresh) {
      ingestLatestAcademicPapers(false).catch((e) =>
        console.error('[api/academic] Background academic ingest error:', e)
      );
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
        case '3m':
          startDate.setMonth(now.getMonth() - 3);
          break;
        case '6m':
        default:
          startDate.setMonth(now.getMonth() - 6);
          break;
      }
    }

    let papers: AcademicPaper[];
    let searchMode: 'feed' | 'hybrid' | 'lexical' = 'feed';

    if (query.trim()) {
      const queryEmbedding = await getEmbedding(query);
      searchMode = queryEmbedding ? 'hybrid' : 'lexical';
      papers = await searchAcademicPapers({
        query,
        queryEmbedding,
        limit,
        primaryCategory: track,
        startDate,
        offset,
      });
    } else {
      papers = await getAcademicPapers({
        limit,
        startDate,
        offset,
        primaryCategory: track,
        sortBy,
      });
    }

    const stats = await getDBStats();
    const telemetry = getAITelemetry();

    return NextResponse.json({
      papers,
      hasMore: papers.length === limit,
      meta: {
        engine: stats.engine,
        totalAcademicPapers: stats.totalAcademicPapers,
        totalLabArticles: stats.totalArticles,
        categoryCounts: stats.academicCategoryCounts,
        summaryModel: telemetry.primaryModel,
        reasoningModel: telemetry.neonModel,
        searchMode,
      },
    });
  } catch (error) {
    console.error('[api/academic] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
