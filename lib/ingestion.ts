import Parser from 'rss-parser';
import { saveArticles, getArticles, Article } from '@/lib/db';
import { getEmbedding } from '@/lib/vertex';
import { VertexAI } from '@google-cloud/vertexai';

const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml; q=0.1',
  },
});

// ---------------------------------------------------------------------------
// Vertex AI client for tag generation (uses ADC / env vars)
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertex_ai = project ? new VertexAI({ project, location }) : null;

if (!vertex_ai) console.warn('[ingestion] Vertex AI not initialised: Missing project ID');

// ---------------------------------------------------------------------------
// Concurrency helper — processes items in parallel batches of `batchSize`
// ---------------------------------------------------------------------------
async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// RSS feeds
// ---------------------------------------------------------------------------
const FEEDS = [
  { url: 'https://research.google/blog/rss/', source: 'Google Research' },
  { url: 'https://deepmind.com/blog/feed/basic', source: 'Google DeepMind' },
  { url: 'https://openai.com/news/rss.xml', source: 'OpenAI' },
  {
    url: 'https://blogs.technet.microsoft.com/machinelearning/feed',
    source: 'Microsoft Research',
  },
  {
    url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_xainews.xml',
    source: 'x.AI',
  },
  {
    url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml',
    source: 'Anthropic',
  },
  {
    url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml',
    source: 'Anthropic',
  },
  {
    url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_red.xml',
    source: 'Anthropic',
  },
] as const;

// ---------------------------------------------------------------------------
// Main ingestion pipeline
// ---------------------------------------------------------------------------
export async function ingestAll(_refresh = false): Promise<Article[]> {
  console.log('[ingestion] Starting...');

  // 1. Fetch all RSS feeds in parallel
  const rssResults = await Promise.all(
    FEEDS.map((f) => fetchRSS(f.url, f.source as Article['source'])),
  );
  const allArticles = rssResults.flat();

  // 2. Deduplicate by normalised link
  const uniqueArticles = deduplicateArticles(allArticles);
  console.log(`[ingestion] ${uniqueArticles.length} unique articles fetched.`);

  // 3. Bulk-save raw articles (tags/embeddings filled in next step)
  await saveArticles(uniqueArticles);

  // 4. Generate missing tags + embeddings in parallel batches of 5
  await processMissingMetadata();

  return uniqueArticles;
}

// ---------------------------------------------------------------------------
// RSS fetching + normalisation
// ---------------------------------------------------------------------------
async function fetchRSS(url: string, source: Article['source']): Promise<Article[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml; q=0.1',
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const feed = await parser.parseString(xml);

    return feed.items
      .map((item) => {
        let title = item.title || 'No title';
        let link = item.link || '';

        if (source === 'Anthropic') {
          if (link.includes('/team/')) return null;
          // Remove date prefix e.g. "Dec 4, 2025Societal Impacts..."
          title = title.replace(/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/, '').trim();
          // Fix mashed CamelCase
          title = title.replace(/([a-z])([A-Z])/g, '$1 $2');
        }

        const article: Article = {
          title,
          link,
          date:
            item.isoDate ||
            (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
          source,
          snippet: item.contentSnippet || item.content || '',
          tags: item.categories ? item.categories.slice(0, 4) : [],
        };
        return article;
      })
      .filter((a): a is Article => a !== null);
  } catch (error) {
    console.error(`[ingestion] Failed to fetch ${source} (${url}):`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deduplication — normalise links (strip query params + trailing slashes)
// ---------------------------------------------------------------------------
function deduplicateArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    const key = a.link.split('?')[0].replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Post-processing — generate tags + embeddings for articles that are missing them
// Runs 5 articles concurrently to stay within rate limits.
// ---------------------------------------------------------------------------
async function processMissingMetadata(): Promise<void> {
  console.log('[ingestion] Processing missing metadata (tags/embeddings)...');

  const articles = await getArticles(1000);
  const needsWork = articles.filter(
    (a) => !a.tags || a.tags.length === 0 || !a.embedding,
  );

  if (needsWork.length === 0) {
    console.log('[ingestion] All articles have metadata — nothing to do.');
    return;
  }

  console.log(`[ingestion] ${needsWork.length} articles need metadata.`);

  const updated: Article[] = [];

  await runInBatches(needsWork, 5, async (article) => {
    let changed = false;

    // Generate tags if missing
    if (!article.tags || article.tags.length === 0) {
      const tags = await generateTags(article);
      if (tags.length > 0) {
        article.tags = tags;
        changed = true;
      }
    }

    // Generate embedding if missing
    if (!article.embedding) {
      const embedding = await getEmbedding(`${article.title} ${article.snippet}`);
      if (embedding) {
        article.embedding = embedding;
        changed = true;
      }
    }

    if (changed) updated.push(article);
  });

  // Single bulk upsert for all updated articles
  if (updated.length > 0) {
    await saveArticles(updated);
    console.log(`[ingestion] Saved metadata for ${updated.length} articles.`);
  }
}

// ---------------------------------------------------------------------------
// Tag generation via Gemini (Vertex AI)
// ---------------------------------------------------------------------------
async function generateTags(article: Article): Promise<string[]> {
  if (!vertex_ai) return [];
  try {
    const model = vertex_ai.preview.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Analyze this article snippet and title. Generate 3-4 relevant technical tags (e.g., "LLM", "Computer Vision", "Reinforcement Learning"). Return a JSON array of strings.

Title: ${article.title}
Snippet: ${article.snippet}`;

    const result = await model.generateContent(prompt);
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText) as string[];
    }
  } catch (e) {
    console.error('[ingestion] Error generating tags:', e);
  }
  return [];
}
