import { getAccessToken, project } from '@/lib/vertex';
import { Article } from './db';

export async function rerankArticles(query: string, articles: Article[]): Promise<Article[]> {
  if (!project) {
    console.warn('[reranker] Project ID not found, skipping rerank');
    return articles;
  }

  try {
    const token = await getAccessToken();

    const records = articles.map((article) => ({
      id: article.link,
      title: article.title,
      content: article.snippet || article.title,
    }));

    const response = await fetch(
      `https://discoveryengine.googleapis.com/v1/projects/${project}/locations/global/rankingConfigs/default_ranking_config:rank`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          records,
          topN: articles.length,
          ignoreRecordDetailsInResponse: true,
          model: 'semantic-ranker-512@latest',
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[reranker] API error:', errorText);
      return articles; // Fallback to original order
    }

    const data = await response.json();
    const rankedRecords: Array<{ id: string; score: number }> = data.records || [];

    const scoreMap = new Map<string, number>(
      rankedRecords
        .filter((r) => r.id != null && r.score != null)
        .map((r) => [r.id, r.score]),
    );

    return [...articles]
      .map((article) => ({ ...article, score: scoreMap.get(article.link) }))
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  } catch (e) {
    console.error('[reranker] Error reranking articles:', e);
    return articles;
  }
}
