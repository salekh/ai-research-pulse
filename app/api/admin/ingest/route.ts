import { NextResponse } from 'next/server';
import { ingestAll } from '@/lib/ingestion';
import { ingestLatestAcademicPapers } from '@/lib/academic-ingestion';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for serverless

export async function POST(request: Request) {
  // Guard with a shared secret — set ADMIN_SECRET in env vars.
  // If the env var is not set, the endpoint is open (useful for local dev).
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${adminSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    const [articles, academicCount] = await Promise.all([
      ingestAll(refresh),
      ingestLatestAcademicPapers(refresh).catch((e) => {
        console.error('[admin/ingest] Academic ingest warning:', e);
        return 0;
      }),
    ]);

    return NextResponse.json({
      success: true,
      count: articles.length,
      academicCount,
      message: `Ingested ${articles.length} lab articles and ${academicCount} academic papers.`,
    });
  } catch (error) {
    console.error('[admin/ingest] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 },
    );
  }
}
