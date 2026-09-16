import { Article } from './db';
import { generateContentWithFallback } from './vertex';

const EXCLUDED_URL_PATTERNS = ['/team/', '/policies/', '/global-affairs/', '/careers', '/press/'];
const EXCLUDED_TITLES = new Set([
  'Economic Research',
  'Interpretability',
  'Societal Impacts',
  'Alignment',
  'Teacher Access Terms',
]);

/**
 * Filter articles to keep only genuine technical AI research.
 * First applies fast heuristic URL/title pruning, then uses gemini-3.8-flash
 * batch classification with deterministic fallback.
 */
export async function filterTechnicalArticles(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return [];

  // Step 1: Fast deterministic rule filter (strips navigation/policy/PR links immediately)
  const preFiltered = articles.filter((a) => {
    if (!a.title || !a.link) return false;
    if (EXCLUDED_TITLES.has(a.title.trim())) return false;
    const linkLower = a.link.toLowerCase();
    for (const pattern of EXCLUDED_URL_PATTERNS) {
      if (linkLower.includes(pattern)) return false;
    }
    return true;
  });

  if (preFiltered.length === 0) return [];

  const batchSize = 20;
  const validArticles: Article[] = [];

  for (let i = 0; i < preFiltered.length; i += batchSize) {
    const batch = preFiltered.slice(i, i + batchSize);

    const prompt = `You are the editorial filter for a technical AI research newsletter. Your audience is ML engineers and researchers — they want papers, methods, and technical insights, not business news.

**KEEP** articles about:
- New models, architectures, or training methods (technical details required)
- Research papers, preprints, and technical blog posts
- Benchmark results, evaluations, and ablation studies
- Safety research with technical depth (alignment, interpretability, red-teaming)
- Engineering blog posts about ML infrastructure, scaling, or deployment
- AI for science (protein folding, drug discovery, climate modeling, etc.)
- Open-source model/dataset releases with technical documentation

**EXCLUDE** articles about:
- Business news (earnings, stock price, acquisitions, funding rounds)
- Executive changes (new CEO, board appointments, departures)
- Pure product announcements without technical details ("We launched X")
- Regulatory / policy news (unless deeply technical, e.g., a technical compliance framework)
- Event announcements, hiring posts, or company culture pieces

Input Articles:
${batch
  .map(
    (a, idx) =>
      `[${idx}] Title: ${a.title}\nSnippet: ${a.snippet?.substring(0, 200) || '(no snippet)'}`
  )
  .join('\n\n')}

Return a JSON object: { "keep_indices": [0, 2, 5, ...] }
Only include indices of articles that should be KEPT. Indices are 0-based and must be between 0 and ${
      batch.length - 1
    }.`;

    try {
      const { text } = await generateContentWithFallback({
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const result = JSON.parse(text);
      const keepIndices = result.keep_indices;

      if (Array.isArray(keepIndices)) {
        keepIndices.forEach((idx: number) => {
          if (Number.isInteger(idx) && idx >= 0 && idx < batch.length) {
            validArticles.push(batch[idx]);
          }
        });
      } else {
        validArticles.push(...batch);
      }
    } catch (e) {
      // Deterministic heuristic fallback if Vertex AI is offline or requires reauth
      for (const article of batch) {
        const text = `${article.title} ${article.snippet}`.toLowerCase();
        const isFluff = /\b(hiring|earnings|stock price|board of directors|summit|webinar)\b/.test(
          text
        );
        if (!isFluff) validArticles.push(article);
      }
    }
  }

  return validArticles;
}
