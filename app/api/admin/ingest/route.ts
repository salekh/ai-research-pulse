import { NextResponse } from 'next/server';
import { ingestAll } from '@/lib/ingestion';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for serverless

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    
    // Optional: Add a simple secret check if needed
    // const authHeader = request.headers.get('Authorization');
    // if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const articles = await ingestAll(refresh);
    
    return NextResponse.json({ 
      success: true, 
      count: articles.length,
      message: `Ingested ${articles.length} articles.` 
    });
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
  }
}
