import { GoogleAuth } from 'google-auth-library';
import { Article } from './db';

const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

export async function rerankArticles(query: string, articles: Article[]): Promise<Article[]> {
  if (!project) {
    console.warn('Project ID not found, skipping rerank');
    return articles;
  }

  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token;

    if (!token) throw new Error('Failed to get access token');

    // Prepare records for reranking
    // We'll send title and snippet. ID can be the link.
    const records = articles.map((article) => ({
      id: article.link,
      title: article.title,
      content: article.snippet || article.title, // Fallback to title if snippet is empty
    }));

    const response = await fetch(
      `https://discoveryengine.googleapis.com/v1/projects/${project}/locations/global/rankingConfigs/default_ranking_config:rank`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          records: records,
          topN: articles.length, // Return all, but ranked
          ignoreRecordDetailsInResponse: true, // We have the details, just need the order/score
          model: 'semantic-ranker-512@latest'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vertex AI Reranker API Error:', errorText);
      // Fallback to original order
      return articles;
    }

    const data = await response.json();
    
    // data.records contains { id, score }
    // We need to map back to our articles and sort
    const rankedRecords = data.records || [];
    const scoreMap = new Map<string, number>();
    
    rankedRecords.forEach((r: any) => {
      if (r.id && r.score !== undefined) {
        scoreMap.set(r.id, r.score);
      }
    });

    // Sort articles based on the returned scores
    // Articles not in the response (shouldn't happen usually) get a low score
    const sortedArticles = [...articles]
      .map(article => ({
        ...article,
        score: scoreMap.get(article.link)
      }))
      .sort((a, b) => {
        const scoreA = a.score ?? -Infinity;
        const scoreB = b.score ?? -Infinity;
        return scoreB - scoreA;
      });

    return sortedArticles;

  } catch (e) {
    console.error('Error reranking articles:', e);
    return articles;
  }
}
