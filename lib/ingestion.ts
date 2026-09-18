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
  { url: 'https://cloudblog.withgoogle.com/products/ai-machine-learning/rss/', source: 'Google Cloud AI' },
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
  {
    url: 'https://qwenlm.github.io/blog/index.xml',
    source: 'Chinese Frontier',
  },
  {
    url: 'https://export.arxiv.org/api/query?search_query=ti:DeepSeek+OR+ti:Qwen+OR+ti:Kimi+OR+ti:GLM-4+OR+ti:CogVideoX&sortBy=submittedDate&sortOrder=descending&max_results=30',
    source: 'Chinese Frontier',
  },
] as const;

// ---------------------------------------------------------------------------
// Google Cloud Blog Boq batchexecute (SQC9mf) Historical Crawler (2025+)
// ---------------------------------------------------------------------------
export async function fetchGoogleCloudBlogArchive(sinceYear = 2025): Promise<Article[]> {
  const cutoff = new Date(`${sinceYear}-01-01T00:00:00Z`).getTime();
  const allArticles = new Map<string, Article>();
  let page = 1;
  let keepGoing = true;
  const rpcId = 'SQC9mf';

  while (keepGoing && page <= 30) {
    const batchPages = [page, page + 1, page + 2, page + 3, page + 4];
    const results = await Promise.all(
      batchPages.map(async (p) => {
        try {
          const args = [
            'cloudblog',
            'en',
            null,
            null,
            50,
            String(p),
            'article',
            ['ai-machine-learning'],
            [],
          ];
          const reqPayload = [[[rpcId, JSON.stringify(args), null, 'generic']]];
          const body = 'f.req=' + encodeURIComponent(JSON.stringify(reqPayload));
          const res = await fetch(
            `https://cloud.google.com/blog/_/TransformBlogUi/data/batchexecute?rpcids=${rpcId}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              },
              body,
              signal: AbortSignal.timeout(15000),
            }
          );
          if (!res.ok) return [];
          const text = await res.text();
          const lines = text.split('\n').filter((l) => l.trim().startsWith('['));
          if (lines.length === 0) return [];
          const outer = JSON.parse(lines[0]);
          const data = JSON.parse(outer[0][2]);
          return data[0] || [];
        } catch {
          return [];
        }
      })
    );

    for (const items of results) {
      if (!items || items.length === 0) {
        keepGoing = false;
        break;
      }
      for (const item of items) {
        const ts = item[8] && item[8][0] ? item[8][0] * 1000 : 0;
        if (ts >= cutoff) {
          const url = item[7];
          const title = item[1];
          const snippet = item[16] || item[2] || '';
          if (url && title) {
            allArticles.set(url, {
              title: String(title).trim(),
              link: String(url).trim(),
              date: new Date(ts).toISOString(),
              source: 'Google Cloud AI',
              snippet: String(snippet).trim(),
            });
          }
        } else {
          keepGoing = false;
        }
      }
    }
    page += 5;
  }

  return Array.from(allArticles.values());
}

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

    // 1b. Self-healing check: if fewer than 100 Google Cloud AI articles exist, backfill 2025+ archive
    try {
      const existingGCloud = await getArticles(200, undefined, 0, 'Google Cloud AI');
      if (existingGCloud.length < 100) {
        console.log('[ingestion] Fewer than 100 Google Cloud AI articles found — fetching 2025+ historical archive...');
        const archiveArticles = await fetchGoogleCloudBlogArchive(2025);
        allArticles.push(...archiveArticles);
      }
    } catch (e) {
      console.warn('[ingestion] Historical Google Cloud AI check warning:', e);
    }

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
        let subLabTag: string | null = null;
        if (source === 'Chinese Frontier') {
          title = title.replace(/\s+/g, ' ').trim();
          const combined = `${title} ${snippet}`;
          if (/\b(deepseek|janus-pro|janusflow|native sparse attention|dualpipe|flashmla)\b/i.test(combined)) {
            subLabTag = 'DeepSeek';
          } else if (/\b(qwen|qwq|tongyi)\b/i.test(combined) || link.includes('qwenlm.github.io')) {
            subLabTag = 'Qwen';
          } else if (/\b(kimi|moonshot|mooncake|moonlight)\b/i.test(combined)) {
            subLabTag = 'Kimi';
          } else if (/\b(glm|chatglm|cogvideox|cogview|autoglm|zhipu|thudm)\b/i.test(combined)) {
            subLabTag = 'GLM';
          }
          if (subLabTag && !title.startsWith(`[${subLabTag}]`)) {
            title = `[${subLabTag}] ${title}`;
          }
        }

        const rawCategories = item.categories
          ? item.categories.filter((c) => typeof c === 'string' && c.length < 25).slice(0, 3)
          : [];
        const baseTags =
          rawCategories.length > 0 ? rawCategories : extractTagsDeterministic(title, snippet);
        const finalTags = subLabTag ? [subLabTag, ...baseTags.filter((t) => t !== subLabTag)] : baseTags;

        const article: Article = {
          title,
          link,
          date:
            item.isoDate ||
            (item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()),
          source,
          snippet,
          tags: finalTags,
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
