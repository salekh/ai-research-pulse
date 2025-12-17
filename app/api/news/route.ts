import { NextResponse } from 'next/server';
import { getArticles, searchArticlesVector, Article } from '@/lib/db';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { ingestAll } from '@/lib/ingestion';
import { rerankArticles } from '@/lib/reranker';

export const dynamic = 'force-dynamic';

// Initialize Vertex AI (needed for reranking if used here, or we can move reranking to lib too)
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertex_ai = project ? new VertexAI({ project, location }) : null;

async function getEmbeddings(texts: string[]) {
  // ... (Keep this helper if needed for query embedding, or move to lib/ingestion/utils)
  // Actually, let's duplicate it or move it. For now, keeping it here is fine, or better:
  // We can export generateEmbedding from lib/ingestion and use it here?
  // But generateEmbedding takes an Article.
  // Let's keep a simple getEmbeddings here or make a shared lib/vertex.ts.
  // To be clean, I'll keep it here for now to avoid breaking too many things at once, 
  // but I'll strip out the unused ingestion code.
  
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token;

    if (!token) throw new Error('Failed to get access token');

    const results = await Promise.all(texts.map(async (text) => {
      const response = await fetch(
        `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-004:predict`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instances: [{ content: text }]
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Vertex AI API failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.predictions[0].embeddings.values;
    }));

    return results;
  } catch (e) {
    console.error('Error generating embeddings:', e);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const refresh = searchParams.get('refresh') === 'true';

  try {
    // If refresh is requested, trigger ingestion
    if (refresh) {
      await ingestAll(true);
    }

    // Always return articles from DB
    let articles: Article[] = [];
    
    // Calculate start date based on timeRange
    const timeRange = searchParams.get('timeRange') || '2w'; // Default to 2 weeks
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = 30;
    const offset = (page - 1) * limit;

    let startDate: Date | undefined;
    
    if (timeRange !== 'all') {
      const now = new Date();
      startDate = new Date();
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
          startDate.setDate(now.getDate() - 14); // Default 2w
      }
    }

    if (query) {
      let queryEmbedding: number[] | null = null;
      try {
        const embeddings = await getEmbeddings([query]);
        if (embeddings.length > 0) {
          queryEmbedding = embeddings[0];
        }
      } catch (e) {
        console.error('Failed to get query embedding:', e);
      }

      if (queryEmbedding) {
        // Use pgvector search
        // When searching, we want the best matches regardless of time, unless specifically filtered?
        // User requested: "search across articles from the whole time range, not only recent ones"
        // So we ignore startDate for vector search.
        articles = await searchArticlesVector(queryEmbedding, limit);
        
        // Rerank top results if Vertex AI is available
        if (vertex_ai) {
             articles = await rerankArticles(query, articles);
        }
      } else {
        // Fallback to simple DB search if embedding fails (or if we want keyword search, but we don't have it yet)
        // For now, just return recent articles if embedding fails, or maybe we should implement keyword search?
        // Let's fallback to recent for now to avoid empty results if embedding fails.
        articles = await getArticles(limit, startDate, offset);
      }
    } else {
      articles = await getArticles(limit, startDate, offset);
    }

    return NextResponse.json({ articles, hasMore: articles.length === limit });
  } catch (error) {
    console.error('Error in GET /api/news:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
