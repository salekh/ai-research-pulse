import { VertexAI } from '@google-cloud/vertexai';
import { Article } from './db';

// ---------------------------------------------------------------------------
// Vertex AI client (ADC — same auth pattern as all other modules)
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

const vertex = project ? new VertexAI({ project, location }) : null;

const model = vertex
  ? vertex.preview.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    })
  : null;

if (!vertex) console.warn('[content-filter] Vertex AI not initialised: Missing project ID');

// ---------------------------------------------------------------------------
// Filter articles to keep only genuine technical AI research
// ---------------------------------------------------------------------------
export async function filterTechnicalArticles(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return [];
  if (!model) {
    console.warn('[content-filter] No model available — returning all articles unfiltered');
    return articles;
  }

  const batchSize = 20;
  const validArticles: Article[] = [];

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

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
- Thought leadership, opinion pieces, or "AI will change everything" fluff
- Event announcements, hiring posts, or company culture pieces

**EDGE CASES — KEEP these:**
- A product launch blog post that includes model architecture details or benchmark numbers → KEEP
- An AI regulation paper that proposes a technical auditing framework → KEEP
- A safety paper analyzing failure modes with concrete examples → KEEP

**EDGE CASES — EXCLUDE these:**
- "Our new AI product is now available" with no technical details → EXCLUDE
- "The state of AI in 2025" opinion roundup → EXCLUDE

Input Articles:
${batch.map((a, idx) => `[${idx}] Title: ${a.title}\nSnippet: ${a.snippet?.substring(0, 200) || '(no snippet)'}`).join('\n\n')}

Return a JSON object: { "keep_indices": [0, 2, 5, ...] }
Only include indices of articles that should be KEPT. Indices are 0-based and must be between 0 and ${batch.length - 1}.`;

    try {
      const response = await model.generateContent(prompt);
      const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        // If model returns nothing, keep the batch to avoid data loss
        validArticles.push(...batch);
        continue;
      }

      const result = JSON.parse(text);
      const keepIndices = result.keep_indices;

      if (Array.isArray(keepIndices)) {
        keepIndices.forEach((idx: number) => {
          if (Number.isInteger(idx) && idx >= 0 && idx < batch.length) {
            validArticles.push(batch[idx]);
          }
        });
      } else {
        // Unexpected format — keep all to avoid data loss
        validArticles.push(...batch);
      }
    } catch (e) {
      console.error('[content-filter] Error filtering batch — keeping all articles to avoid data loss:', e);
      validArticles.push(...batch);
    }
  }

  return validArticles;
}
