import Parser from 'rss-parser';
import { saveArticles, getArticles, Article } from '@/lib/db';
import { getEmbeddingsBatch, generateContentWithFallback } from '@/lib/vertex';
import { filterTechnicalArticles } from '@/lib/content-filter';

const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml; q=0.1',
  },
});

// ---------------------------------------------------------------------------
// Server-side ingestion mutex & cooldown to prevent client DDoS
// ---------------------------------------------------------------------------
let isIngesting = false;
let lastIngestionTime = 0;
const INGESTION_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes server-side cooldown

// ---------------------------------------------------------------------------
// Canonical tag taxonomy
// ---------------------------------------------------------------------------
export const TAG_TAXONOMY = [
  'LLM', 'Vision', 'Multimodal', 'Audio', 'Video',
  'RL', 'Robotics', 'Agents',
  'Safety', 'Alignment', 'Interpretability',
  'Efficiency', 'Quantization', 'Distillation',
  'Training', 'Fine-tuning', 'RLHF',
  'Inference', 'Serving', 'Systems',
  'Data', 'Synthetic Data', 'Evaluation',
  'RAG', 'Retrieval', 'Search',
  'Code', 'Math', 'Reasoning',
  'Science', 'Healthcare', 'Climate',
  'Diffusion', 'Generation', 'World Models',
] as const;

const DETERMINISTIC_TAXONOMY_RULES: Array<{ tag: string; regex: RegExp }> = [
  { tag: 'LLM', regex: /\b(llm|language model|gpt|claude|gemini|transformer|llama|token)\b/i },
  { tag: 'Reasoning', regex: /\b(reason|chain of thought|math|o1|o3|thinking|step-by-step|logic)\b/i },
  { tag: 'Multimodal', regex: /\b(multimodal|vision-language|audio|speech|voice|image-to-text)\b/i },
  { tag: 'Video', regex: /\b(sora|video|veo|cinematic|motion)\b/i },
  { tag: 'Vision', regex: /\b(vision|image|diffusion|pixel|segmentation|detection|3d)\b/i },
  { tag: 'Agents', regex: /\b(agent|agentic|tool use|computer use|browser|workflow|autonomous)\b/i },
  { tag: 'RL', regex: /\b(reinforcement learning|rlhf|reward|policy gradient|ppo|dpo)\b/i },
  { tag: 'Safety', regex: /\b(safety|alignment|jailbreak|red team|constitutional|guardrail|hallucination|robustness)\b/i },
  { tag: 'Interpretability', regex: /\b(interpretability|mechanistic|feature|circuit|attention head|sparse autoencoder)\b/i },
  { tag: 'Efficiency', regex: /\b(efficiency|quantization|distillation|pruning|flashattention|inference|latency|throughput)\b/i },
  { tag: 'Code', regex: /\b(code|coding|programming|software engineer|swe-bench|copilot|compiler)\b/i },
  { tag: 'Science', regex: /\b(protein|alphafold|genom|chemistry|molecule|physics|weather|climate|medical|healthcare)\b/i },
  { tag: 'Robotics', regex: /\b(robot|embodied|manipulation|locomotion|humanoid)\b/i },
  { tag: 'Evaluation', regex: /\b(benchmark|evaluation|eval|leaderboard|indqa|mmlu)\b/i },
  { tag: 'Training', regex: /\b(pre-training|fine-tuning|post-training|dataset|synthetic data|scaling law)\b/i },
];

export function extractTagsDeterministic(title: string, snippet: string): string[] {
  const text = `${title} ${snippet}`;
  const matched: string[] = [];
  for (const rule of DETERMINISTIC_TAXONOMY_RULES) {
    if (rule.regex.test(text)) matched.push(rule.tag);
    if (matched.length >= 3) break;
  }
  return matched.length > 0 ? matched : ['LLM', 'Research'];
}

// ---------------------------------------------------------------------------
// RSS feeds
// ---------------------------------------------------------------------------
export const FEEDS = [
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
// Main ingestion pipeline (with mutex & technical filtering)
// ---------------------------------------------------------------------------
export async function ingestAll(force = false): Promise<Article[]> {
  const now = Date.now();
  if (isIngesting) {
    console.log('[ingestion] Ingestion already in progress — skipping concurrent run.');
    return getArticles(50);
  }
  if (!force && now - lastIngestionTime < INGESTION_COOLDOWN_MS) {
    console.log('[ingestion] Within 15-min cooldown — skipping duplicate RSS refresh.');
    return getArticles(50);
  }

  isIngesting = true;
  lastIngestionTime = now;

  try {
    console.log('[ingestion] Starting RSS aggregation...');

    // 1. Fetch all RSS feeds in parallel
    const rssResults = await Promise.all(
      FEEDS.map((f) => fetchRSS(f.url, f.source as Article['source']))
    );
    const allArticles = rssResults.flat();

    // 2. Deduplicate by normalised link
    const uniqueArticles = deduplicateArticles(allArticles);

    // 3. Filter out non-technical / PR / navigation articles BEFORE database storage
    const technicalArticles = await filterTechnicalArticles(uniqueArticles);
    console.log(
      `[ingestion] Fetched ${uniqueArticles.length} unique -> kept ${technicalArticles.length} technical articles.`
    );

    // 4. Bulk-save raw articles
    await saveArticles(technicalArticles);

    // 5. Enrich missing tags & embeddings in efficient batches
    await processMissingMetadata();

    return technicalArticles;
  } finally {
    isIngesting = false;
  }
}

// ---------------------------------------------------------------------------
// RSS fetching + normalisation
// ---------------------------------------------------------------------------
async function fetchRSS(url: string, source: Article['source']): Promise<Article[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml; q=0.1',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const feed = await parser.parseString(xml);

    return feed.items
      .map((item) => {
        let title = item.title || 'No title';
        const link = item.link || '';
        if (!link) return null;

        if (source === 'Anthropic') {
          if (link.includes('/team/')) return null;
          title = title.replace(/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/, '').trim();
          title = title.replace(/([a-z])([A-Z])/g, '$1 $2');
        }

        const snippet = (item.contentSnippet || item.content || '').replace(/<[^>]*>?/gm, '').trim();
        const rawCategories = item.categories
          ? item.categories.filter((c) => typeof c === 'string' && c.length < 25).slice(0, 3)
          : [];

        const article: Article = {
          title,
          link,
          date:
            item.isoDate ||
            (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
          source,
          snippet,
          tags:
            rawCategories.length > 0
              ? rawCategories
              : extractTagsDeterministic(title, snippet),
        };
        return article;
      })
      .filter((a): a is Article => a !== null);
  } catch (error) {
    console.error(`[ingestion] Failed to fetch ${source} (${url}):`, error);
    return [];
  }
}

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
// Batch Post-processing — generates tags & embeddings in batches (15x fewer LLM calls)
// ---------------------------------------------------------------------------
export async function processMissingMetadata(maxArticles = 60): Promise<number> {
  const articles = await getArticles(maxArticles, undefined, 0, undefined, true);
  const needsTags = articles.filter((a) => !a.tags || a.tags.length === 0);
  const needsEmbeddings = articles.filter((a) => !a.embedding);

  if (needsTags.length === 0 && needsEmbeddings.length === 0) {
    return 0;
  }

  // 1. Batch Tag Generation (up to 15 articles per Gemini call)
  if (needsTags.length > 0) {
    const TAG_BATCH = 15;
    for (let i = 0; i < needsTags.length; i += TAG_BATCH) {
      const chunk = needsTags.slice(i, i + TAG_BATCH);
      const batchTags = await generateTagsBatch(chunk);
      chunk.forEach((art, idx) => {
        art.tags =
          batchTags[idx] && batchTags[idx].length > 0
            ? batchTags[idx]
            : extractTagsDeterministic(art.title, art.snippet);
      });
    }
  }

  // 2. Batch Embedding Generation (up to 100 per Vertex AI call)
  if (needsEmbeddings.length > 0) {
    const texts = needsEmbeddings.map((a) => `${a.title} ${a.snippet}`);
    const embeddings = await getEmbeddingsBatch(texts);
    needsEmbeddings.forEach((art, idx) => {
      if (embeddings[idx]) {
        art.embedding = embeddings[idx]!;
      }
    });
  }

  // Single bulk upsert
  const updated = Array.from(new Set([...needsTags, ...needsEmbeddings]));
  if (updated.length > 0) {
    await saveArticles(updated);
  }
  return updated.length;
}

async function generateTagsBatch(articles: Article[]): Promise<string[][]> {
  if (articles.length === 0) return [];
  try {
    const prompt = `Classify each of the following ${articles.length} AI research articles into 2-4 tags from the canonical taxonomy.
Allowed tags: ${TAG_TAXONOMY.join(', ')}

Articles:
${articles
  .map(
    (a, idx) =>
      `[${idx}] Title: ${a.title}\nSnippet: ${a.snippet?.substring(0, 200) || '(no snippet)'}`
  )
  .join('\n\n')}

Return a JSON object mapping each index to an array of 2-4 allowed tags:
{
  "results": [
    ["LLM", "Reasoning"],
    ["Vision", "Diffusion"]
  ]
}`;

    const { text } = await generateContentWithFallback({
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.results)) {
      return parsed.results.map((tags: any[]) =>
        Array.isArray(tags)
          ? tags.filter((t) => TAG_TAXONOMY.includes(t as any)).slice(0, 4)
          : []
      );
    }
  } catch (e) {
    console.warn('[ingestion] Batch tag generation fallback to deterministic rules.');
  }
  return articles.map((a) => extractTagsDeterministic(a.title, a.snippet));
}
