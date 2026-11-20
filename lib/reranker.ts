import {
  generateContentWithFallback,
  getAccessToken,
  MODEL_REGISTRY,
  project,
} from '@/lib/vertex';
import { Article } from './db';

/**
 * Fallback semantic reranker powered by Gemini 4 Hydrogen (LOW thinking)
 * when Vertex AI Discovery Engine Ranking API is unavailable or unconfigured.
 */
async function rerankWithGeminiHydrogen(
  query: string,
  articles: Article[]
): Promise<Article[]> {
  const candidates = articles.slice(0, 25);
  const tail = articles.slice(25);

  const prompt = `You are a high-precision technical AI research search reranker.
Rank the candidate articles by technical relevance to the query.

Query: "${query}"

Candidates:
${candidates
  .map(
    (a, idx) =>
      `[${idx}] ${a.title} (${a.source}) — ${(a.snippet || '').slice(0, 180)}`
  )
  .join('\n')}

Return JSON with this exact schema:
{
  "rankings": [
    { "index": 0, "score": 0.95 }
  ]
}
Include every relevant candidate index sorted from highest to lowest score (0.0 to 1.0).`;

  const { text } = await generateContentWithFallback({
    contents: prompt,
    tier: 'hydrogen',
    thinkingLevel: 'LOW',
    config: {
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });

  const parsed = JSON.parse(text);
  const rankings: Array<{ index: number; score: number }> = Array.isArray(
    parsed?.rankings
  )
    ? parsed.rankings
    : [];

  if (rankings.length === 0) return articles;

  const scoreByIdx = new Map<number, number>();
  for (const r of rankings) {
    if (
      Number.isInteger(r?.index) &&
      r.index >= 0 &&
      r.index < candidates.length &&
      typeof r?.score === 'number'
    ) {
      scoreByIdx.set(r.index, r.score);
    }
  }

  const rerankedHead = candidates
    .map((article, idx) => ({
      ...article,
      score: scoreByIdx.has(idx) ? scoreByIdx.get(idx) : article.score,
    }))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

  return [...rerankedHead, ...tail];
}

// Circuit breaker so a 403/401/404 from Discovery Engine doesn't add latency on every search
let discoveryEngineCooldownUntil = 0;
const DISCOVERY_ENGINE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function rerankArticles(
  query: string,
  articles: Article[],
  options?: { allowLlmFallback?: boolean }
): Promise<Article[]> {
  if (!project || articles.length <= 1) {
    if (!project) {
      console.warn('[reranker] Project ID not found, skipping rerank');
    }
    return articles;
  }

  const allowLlmFallback = options?.allowLlmFallback ?? false;

  // Fast path: if Discovery Engine recently denied permission, immediately keep hybrid DB scores
  if (Date.now() < discoveryEngineCooldownUntil) {
    if (allowLlmFallback) {
      try {
        return await rerankWithGeminiHydrogen(query, articles);
      } catch {
        return articles;
      }
    }
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
        signal: AbortSignal.timeout(1500),
        body: JSON.stringify({
          query,
          records,
          topN: articles.length,
          ignoreRecordDetailsInResponse: true,
          model: MODEL_REGISTRY.RERANKER,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        discoveryEngineCooldownUntil = Date.now() + DISCOVERY_ENGINE_COOLDOWN_MS;
      }
      console.warn(
        `[reranker] Discovery Engine ${MODEL_REGISTRY.RERANKER} error (${response.status}): ${errorText.slice(0, 120)} — using fast hybrid scores`
      );
      if (allowLlmFallback) {
        return await rerankWithGeminiHydrogen(query, articles);
      }
      return articles;
    }

    const data = await response.json();
    const rankedRecords: Array<{ id: string; score: number }> =
      data.records || [];

    const scoreMap = new Map<string, number>(
      rankedRecords
        .filter((r) => r.id != null && r.score != null)
        .map((r) => [r.id, r.score])
    );

    return [...articles]
      .map((article) => ({ ...article, score: scoreMap.get(article.link) ?? article.score }))
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  } catch (e) {
    console.warn('[reranker] Discovery Engine rerank failed, using fast hybrid scores:', e);
    if (allowLlmFallback) {
      try {
        return await rerankWithGeminiHydrogen(query, articles);
      } catch (llmErr) {
        console.error('[reranker] Gemini Hydrogen fallback also failed:', llmErr);
      }
    }
    return articles;
  }
}
