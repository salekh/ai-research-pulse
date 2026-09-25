import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
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
  { tag: 'LLM', regex: /\b(llm|language model|gpt|claude|gemini|transformer|llama|muse|token)\b/i },
  { tag: 'Reasoning', regex: /\b(reason|reasoning|chain of thought|math|o1|o3|thinking|step-by-step|logic|muse spark)\b/i },
  { tag: 'Multimodal', regex: /\b(multimodal|vision-language|audio|speech|voice|image-to-text|transcribe|avatar|seamless|omni)\b/i },
  { tag: 'Audio', regex: /\b(audio|speech|voice|transcribe|asr|diarization|endpointing)\b/i },
  { tag: 'Video', regex: /\b(sora|video|veo|cinematic|motion|muse video|avatar)\b/i },
  { tag: 'Vision', regex: /\b(vision|image|diffusion|pixel|segmentation|segment anything|sam|dino|dinov2|dinov3|detection|3d|canopy)\b/i },
  { tag: 'World Models', regex: /\b(world model|v-jepa|jepa|physical reasoning|assetgen|3d world)\b/i },
  { tag: 'Agents', regex: /\b(agent|agentic|tool use|computer use|browser|workflow|autonomous|muse glimmer|muse code|subagent)\b/i },
  { tag: 'RL', regex: /\b(reinforcement learning|rlhf|reward|policy gradient|ppo|dpo)\b/i },
  { tag: 'Safety', regex: /\b(safety|alignment|jailbreak|red team|constitutional|guardrail|hallucination|robustness|cyber|vulnerability|security)\b/i },
  { tag: 'Interpretability', regex: /\b(interpretability|mechanistic|feature|circuit|attention head|sparse autoencoder)\b/i },
  { tag: 'Efficiency', regex: /\b(efficiency|quantization|distillation|pruning|flashattention|inference|latency|throughput|executorch|on-device|rcclx|parallelism|kernel)\b/i },
  { tag: 'Code', regex: /\b(code|coding|programming|software engineer|swe-bench|copilot|compiler|muse code)\b/i },
  { tag: 'Science', regex: /\b(protein|alphafold|genom|chemistry|molecule|molecular|physics|weather|climate|medical|healthcare|brain|neuroscience|tribe|brain2qwerty|oncology|pathology|forest)\b/i },
  { tag: 'Robotics', regex: /\b(robot|robotics|embodied|manipulation|locomotion|humanoid|egomimic|aria)\b/i },
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
    url: 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_meta_ai.xml',
    source: 'Meta AI',
  },
  {
    url: 'https://engineering.fb.com/category/ai-research/feed/',
    source: 'Meta AI',
  },
  {
    url: 'https://engineering.fb.com/category/ml-applications/feed/',
    source: 'Meta AI',
  },
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
// Meta AI Research Portal Crawler (https://research.meta.ai/)
// Crawls home + /blog + /sitemap.xml and enriches each article page
// ---------------------------------------------------------------------------
export async function fetchMetaResearchPortal(): Promise<Article[]> {
  const portalUrls = ['https://research.meta.ai/', 'https://research.meta.ai/blog'];
  const discovered = new Map<
    string,
    { title: string; link: string; date: string; snippet: string }
  >();

  for (const portalUrl of portalUrls) {
    try {
      const res = await fetch(portalUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $('article').each((_, el) => {
        const card = $(el);
        const rawHref = card.find('a[href]').first().attr('href') || '';
        if (!rawHref) return;
        const link = rawHref.startsWith('http')
          ? rawHref
          : `https://research.meta.ai${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
        const title = card
          .find('h2, h1, h3')
          .first()
          .text()
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const dateTime =
          card.find('time').first().attr('datetime') ||
          card.find('time').first().attr('dateTime') ||
          '';
        const cardSnippet = card
          .find('p')
          .first()
          .text()
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (title && link) {
          discovered.set(link, {
            title,
            link,
            date: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString(),
            snippet: cardSnippet,
          });
        }
      });
    } catch (e) {
      console.warn(`[ingestion] Warning fetching Meta portal ${portalUrl}:`, e);
    }
  }

  // Also inspect sitemap.xml so any /blog/ post not on the front grid is captured
  try {
    const res = await fetch('https://research.meta.ai/sitemap.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIResearchPulse/2.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      $('url').each((_, el) => {
        const loc = $(el).find('loc').text().trim();
        const lastmod = $(el).find('lastmod').text().trim();
        if (loc && loc.includes('/blog/') && !discovered.has(loc)) {
          discovered.set(loc, {
            title: '',
            link: loc,
            date: lastmod ? new Date(lastmod).toISOString() : new Date().toISOString(),
            snippet: '',
          });
        }
      });
    }
  } catch {}

  const items = Array.from(discovered.values());
  await Promise.all(
    items.map(async (item) => {
      try {
        const res = await fetch(item.link, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const html = await res.text();
        const $ = cheerio.load(html);

        const ogTitle =
          $('meta[property="og:title"]').attr('content') ||
          $('h1').first().text() ||
          item.title;
        if (!item.title && ogTitle) {
          item.title = ogTitle.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        }

        const metaDesc = (
          $('meta[property="og:description"]').attr('content') ||
          $('meta[name="description"]').attr('content') ||
          ''
        )
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        $('script, style, nav, footer, header').remove();
        const bodyParas: string[] = [];
        $('[class*="max-w-article"] p, main p, article p, p').each((_, pEl) => {
          const parentCls = $(pEl).parent().attr('class') || '';
          if (parentCls.includes('transcriber') || parentCls.includes('Consent')) return;
          const txt = $(pEl)
            .text()
            .replace(/\u00a0/g, ' ')
            .replace(/^\d+\s+minute\s+read\s*/i, '')
            .replace(/^FEATURED\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (
            txt.length > 55 &&
            !txt.toLowerCase().includes('cookie') &&
            !txt.includes('This demo uses your microphone') &&
            !txt.startsWith('For more details about our evaluations')
          ) {
            bodyParas.push(txt);
          }
        });

        const firstPara = bodyParas[0] || '';
        if (metaDesc && firstPara && !firstPara.startsWith(metaDesc.slice(0, 30))) {
          item.snippet = `${metaDesc} ${firstPara}`.slice(0, 550);
        } else {
          item.snippet = (metaDesc || firstPara || item.snippet || item.title).slice(0, 550);
        }
      } catch {}
    })
  );

  return items
    .filter((item) => Boolean(item.title && item.link))
    .map((item) => ({
      title: item.title,
      link: item.link,
      date: item.date,
      source: 'Meta AI' as const,
      snippet: item.snippet || item.title,
      tags: extractTagsDeterministic(item.title, item.snippet || item.title),
    }));
}

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

    // 1. Fetch Meta AI Research Portal (https://research.meta.ai/) + all RSS feeds in parallel
    const [metaPortalArticles, rssResults] = await Promise.all([
      fetchMetaResearchPortal(),
      Promise.all(FEEDS.map((f) => fetchRSS(f.url, f.source as Article['source']))),
    ]);
    const allArticles = [...metaPortalArticles, ...rssResults.flat()];

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

    // 2. Deduplicate by normalised link and (source, title)
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
        let title = (item.title || 'No title').replace(/\u00a0/g, ' ').trim();
        const link = (item.link || '').trim();
        if (!link) return null;

        if (source === 'Anthropic') {
          if (link.includes('/team/')) return null;
          title = title.replace(/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/, '').trim();
          title = title.replace(/([a-z])([A-Z])/g, '$1 $2');
        }

        const snippet = (item.contentSnippet || item.content || '')
          .replace(/<[^>]*>?/gm, '')
          .replace(/\u00a0/g, ' ')
          .trim();
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
          ? item.categories
              .filter((c) => typeof c === 'string' && (TAG_TAXONOMY as readonly string[]).includes(c))
              .slice(0, 3)
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
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  return articles.filter((a) => {
    const linkKey = a.link.split('?')[0].replace(/\/$/, '').toLowerCase();
    const titleKey = `${a.source}::${a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) return false;
    seenLinks.add(linkKey);
    seenTitles.add(titleKey);
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
