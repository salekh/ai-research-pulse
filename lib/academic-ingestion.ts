import * as cheerio from 'cheerio';
import { AcademicPaper, saveAcademicPapers } from './db';
import { extractTagsDeterministic } from './ingestion';
import { generateContentWithFallback, getEmbeddingsBatch } from './vertex';

const ARXIV_USER_AGENT =
  'AI-Research-Pulse/3.1 (https://ai-research-pulse-710258046947.us-central1.run.app; mailto:sanchitalekh@google.com)';

// Strict AI / LLM / Intelligence / Learning arXiv tracks
export const ALLOWED_ARXIV_CATEGORIES = new Set([
  'cs.AI',
  'cs.LG',
  'cs.CL',
  'cs.CV',
  'cs.RO',
  'cs.NE',
  'cs.IR',
  'cs.MA',
  'stat.ML',
]);

const AI_RELEVANCE_REGEX =
  /\b(llm|large language model|language model|transformer|reasoning|agent|agentic|reinforcement learning|rlhf|grpo|world model|multimodal|vision-language|vlm|diffusion|alignment|interpretability|mechanistic|neural network|deep learning|machine learning|foundation model|test-time compute|in-context learning|continual learning|meta-learning|intelligence|benchmark|pretraining|post-training|fine-tuning|quantization|attention|moe|mixture of experts|diffusion model|retrieval|rag|coding model|theorem proving|scientific discovery)\b/i;

export interface RawAcademicCandidate {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  publishedDate: string;
  primaryCategory?: string;
  citationCount: number;
  aiSummaryHint?: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function normalizeArxivId(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf|html)\//i, '')
    .replace(/\.pdf$/i, '')
    .replace(/v\d+$/i, '')
    .replace(/^arxiv:/i, '');
  // Standard post-2007 format: YYMM.NNNNN or YYMM.NNNN
  if (/^\d{4}\.\d{4,5}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function cleanWhitespace(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isAiRelevant(title: string, abstract: string, primaryCategory?: string): boolean {
  const combined = `${title} ${abstract}`;
  if (primaryCategory && ['cs.AI', 'cs.LG', 'cs.CL', 'stat.ML', 'cs.MA', 'cs.NE'].includes(primaryCategory)) {
    return true;
  }
  if (primaryCategory && ['cs.CV', 'cs.RO', 'cs.IR'].includes(primaryCategory)) {
    return AI_RELEVANCE_REGEX.test(combined);
  }
  return AI_RELEVANCE_REGEX.test(combined);
}

/**
 * Fetch trending / high-impact AI papers from Hugging Face Daily Papers API
 * for a given query string (e.g. `month=2026-09&limit=55` or `limit=40`).
 */
export async function fetchHuggingFacePapers(
  queryString: string,
  minDateIso?: string
): Promise<RawAcademicCandidate[]> {
  const out: RawAcademicCandidate[] = [];
  try {
    const res = await fetch(`https://huggingface.co/api/daily_papers?${queryString}`, {
      headers: { 'User-Agent': ARXIV_USER_AGENT },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return out;
    const items = await res.json();
    if (!Array.isArray(items)) return out;

    for (const item of items) {
      const p = item?.paper || item;
      const arxivId = normalizeArxivId(String(p?.id || ''));
      if (!arxivId) continue;

      const title = cleanWhitespace(String(p?.title || item?.title || ''));
      const abstract = cleanWhitespace(String(p?.summary || item?.summary || ''));
      if (!title || abstract.length < 40) continue;

      const rawDate = p?.publishedAt || item?.publishedAt || new Date().toISOString();
      const parsedDate = new Date(rawDate);
      const publishedDate = isNaN(parsedDate.getTime())
        ? new Date().toISOString()
        : parsedDate.toISOString();

      if (minDateIso && publishedDate < minDateIso) continue;

      const authors: string[] = Array.isArray(p?.authors)
        ? p.authors
            .map((a: any) => cleanWhitespace(typeof a === 'string' ? a : a?.name || ''))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      const upvotes = Number(p?.upvotes ?? item?.upvotes ?? 0) || 0;
      const aiSummaryHint = cleanWhitespace(String(p?.ai_summary || '')) || undefined;

      out.push({
        arxivId,
        title,
        abstract: abstract.slice(0, 2400),
        authors,
        publishedDate,
        citationCount: upvotes,
        aiSummaryHint,
      });
    }
  } catch (err: any) {
    console.warn(`[Academic] HF Daily Papers fetch failed (${queryString}):`, err?.message || err);
  }
  return out;
}

/**
 * Reconstruct OpenAlex abstract from `abstract_inverted_index`.
 */
function reconstructOpenAlexAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv || typeof inv !== 'object') return '';
  const words: Array<{ pos: number; word: string }> = [];
  for (const [word, positions] of Object.entries(inv)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      words.push({ pos, word });
    }
  }
  words.sort((a, b) => a.pos - b.pos);
  return cleanWhitespace(words.map((w) => w.word).join(' '));
}

/**
 * Fetch highest-cited arXiv AI/LLM/Intelligence/Learning papers from OpenAlex
 * within a date window (`YYYY-MM-DD`..`YYYY-MM-DD`).
 */
export async function fetchOpenAlexTopArxivPapers(
  fromDate: string,
  toDate: string,
  searchQuery: string,
  perPage = 35
): Promise<RawAcademicCandidate[]> {
  const out: RawAcademicCandidate[] = [];
  try {
    const params = new URLSearchParams({
      filter: `from_publication_date:${fromDate},to_publication_date:${toDate},locations.source.id:S4306400194`,
      search: searchQuery,
      sort: 'cited_by_count:desc',
      'per-page': String(perPage),
    });
    const res = await fetch(`https://api.openalex.org/works?${params.toString()}`, {
      headers: { 'User-Agent': ARXIV_USER_AGENT },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return out;
    const data = await res.json();
    const works = Array.isArray(data?.results) ? data.results : [];

    for (const w of works) {
      const landingUrl =
        w?.primary_location?.landing_page_url ||
        w?.ids?.arxiv ||
        (Array.isArray(w?.locations)
          ? w.locations.find((l: any) => String(l?.landing_page_url || '').includes('arxiv.org'))
              ?.landing_page_url
          : '');
      const arxivId = normalizeArxivId(String(landingUrl || ''));
      if (!arxivId) continue;

      // Ensure paper itself is actually from the target arXiv month window (2605..2611+)
      const yymm = Number(arxivId.slice(0, 4));
      if (yymm < 2605) continue;

      const title = cleanWhitespace(String(w?.title || ''));
      const abstract = reconstructOpenAlexAbstract(w?.abstract_inverted_index);
      if (!title) continue;

      const authors: string[] = Array.isArray(w?.authorships)
        ? w.authorships
            .map((a: any) => cleanWhitespace(a?.author?.display_name || ''))
            .filter(Boolean)
            .slice(0, 8)
        : [];

      const dateStr = w?.publication_date
        ? new Date(`${w.publication_date}T12:00:00Z`).toISOString()
        : new Date().toISOString();

      out.push({
        arxivId,
        title,
        abstract: abstract.slice(0, 2400),
        authors,
        publishedDate: dateStr,
        citationCount: Number(w?.cited_by_count || 0),
      });
    }
  } catch (err: any) {
    console.warn(`[Academic] OpenAlex fetch failed (${searchQuery}):`, err?.message || err);
  }
  return out;
}

/**
 * Parse official arXiv Atom XML into RawAcademicCandidate[].
 */
function parseArxivAtomXml(xml: string): RawAcademicCandidate[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const results: RawAcademicCandidate[] = [];

  $('entry').each((_, el) => {
    const $el = $(el);
    const idText = $el.find('id').first().text().trim();
    const arxivId = normalizeArxivId(idText);
    if (!arxivId) return;

    const title = cleanWhitespace($el.find('title').first().text());
    const abstract = cleanWhitespace($el.find('summary').first().text());
    const publishedRaw = $el.find('published').first().text().trim();
    const parsedDate = new Date(publishedRaw);
    const publishedDate = isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();

    const authors: string[] = [];
    $el.find('author > name').each((__, a) => {
      const name = cleanWhitespace($(a).text());
      if (name && authors.length < 8) authors.push(name);
    });

    const primaryCat =
      $el.find('arxiv\\:primary_category').attr('term') ||
      $el.find('primary_category').attr('term') ||
      $el.find('category').first().attr('term') ||
      'cs.AI';

    if (!title || abstract.length < 30) return;

    results.push({
      arxivId,
      title,
      abstract: abstract.slice(0, 2400),
      authors,
      publishedDate,
      primaryCategory: primaryCat,
      citationCount: 0,
    });
  });

  return results;
}

/**
 * Query arXiv API by explicit `id_list` in polite batches (<= 40 IDs, >= 3.2s delay)
 * to authoritatively enrich `primaryCategory`, canonical abstracts, and authors.
 */
export async function enrichWithArxivApi(
  candidates: Map<string, RawAcademicCandidate>
): Promise<void> {
  const ids = Array.from(candidates.keys());
  const BATCH = 40;

  for (let i = 0; i < ids.length; i += BATCH) {
    if (i > 0) await delay(3200);
    const batch = ids.slice(i, i + BATCH);
    try {
      const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(
        batch.join(',')
      )}&max_results=${batch.length}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': ARXIV_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parseArxivAtomXml(xml);
      for (const p of parsed) {
        const existing = candidates.get(p.arxivId);
        if (existing) {
          existing.primaryCategory = p.primaryCategory || existing.primaryCategory || 'cs.AI';
          if (p.abstract && p.abstract.length > existing.abstract.length) {
            existing.abstract = p.abstract;
          }
          if (p.authors.length > 0 && existing.authors.length === 0) {
            existing.authors = p.authors;
          }
          if (p.title) existing.title = p.title;
        }
      }
    } catch (err: any) {
      console.warn(`[Academic] arXiv enrich batch ${i} warning:`, err?.message || err);
    }
  }
}

/**
 * Fetch the latest preprints directly from arXiv API (`cs.AI`, `cs.LG`, `cs.CL`).
 */
export async function fetchLatestArxivPapers(maxResults = 35): Promise<RawAcademicCandidate[]> {
  try {
    const query = encodeURIComponent('cat:cs.AI OR cat:cs.LG OR cat:cs.CL');
    const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': ARXIV_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseArxivAtomXml(xml);
  } catch (err: any) {
    console.warn('[Academic] Latest arXiv API fetch failed:', err?.message || err);
    return [];
  }
}

/**
 * Generate concise 2-sentence technical summaries + 1-sentence core innovations
 * in batches of 10 using Gemini 4 Hydrogen (light cognition).
 * Strictly processes Title + Abstract ONLY — never whole paper text.
 */
async function generateShortSummariesBatch(
  items: RawAcademicCandidate[]
): Promise<Map<string, { summary: string; keyInnovation: string }>> {
  const out = new Map<string, { summary: string; keyInnovation: string }>();
  const BATCH_SIZE = 10;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const prompt = `You are a concise AI research editor summarizing academic paper abstracts for ML engineers.
For each paper below, synthesize ONLY from the given title and abstract (never fabricate benchmarks or claims):
- "summary": exactly 2 crisp, specific sentences summarizing what the paper proposes and its reported result/finding.
- "keyInnovation": 1 short sentence stating the core novel mechanism or insight.

Return ONLY valid JSON:
{
  "summaries": [
    { "id": "2611.00001", "summary": "...", "keyInnovation": "..." }
  ]
}

Papers:
${chunk
  .map(
    (p) =>
      `[${p.arxivId}] ${p.title}\nAbstract: ${p.abstract.slice(0, 1200)}`
  )
  .join('\n\n')}`;

    try {
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
      const list = Array.isArray(parsed?.summaries) ? parsed.summaries : [];
      for (const entry of list) {
        const id = normalizeArxivId(String(entry?.id || '')) || String(entry?.id || '').trim();
        if (id && typeof entry?.summary === 'string' && entry.summary.trim().length > 20) {
          out.set(id, {
            summary: cleanWhitespace(entry.summary),
            keyInnovation: cleanWhitespace(String(entry?.keyInnovation || '')),
          });
        }
      }
    } catch (err: any) {
      console.warn(
        `[Academic] Hydrogen summary batch ${i} fallback:`,
        err?.message || err
      );
    }
  }

  // Deterministic fallback for any paper missed by LLM batch
  for (const p of items) {
    if (!out.has(p.arxivId)) {
      if (p.aiSummaryHint && p.aiSummaryHint.length > 30) {
        out.set(p.arxivId, {
          summary: p.aiSummaryHint,
          keyInnovation: p.aiSummaryHint.split(/(?<=[.!?])\s+/)[0] || p.title,
        });
      } else {
        const sentences = p.abstract
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.length > 25);
        out.set(p.arxivId, {
          summary: sentences.slice(0, 2).join(' ') || p.abstract.slice(0, 320),
          keyInnovation: sentences[0] || p.title,
        });
      }
    }
  }

  return out;
}

/**
 * Convert raw candidates into strictly abstract+short-summary AcademicPaper objects
 * with deterministic 35-tag taxonomy + 768-dim embeddings, then persist across all tiers.
 */
export async function finalizeAndSaveAcademicCandidates(
  candidatesMap: Map<string, RawAcademicCandidate>,
  options?: { skipGcsBackup?: boolean; maxPapers?: number }
): Promise<AcademicPaper[]> {
  // Filter strictly to AI/LLM/Intelligence/Learning papers
  let filtered = Array.from(candidatesMap.values()).filter(
    (c) => c.title && c.abstract.length >= 40 && isAiRelevant(c.title, c.abstract, c.primaryCategory)
  );

  // Deduplicate by normalized title
  const seenTitles = new Set<string>();
  filtered = filtered.filter((c) => {
    const key = c.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  if (options?.maxPapers && filtered.length > options.maxPapers) {
    // Keep both the newest papers and highest-impact papers balanced across the window
    const byDate = [...filtered].sort(
      (a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
    );
    const recentKeep = byDate.slice(0, Math.min(45, Math.floor(options.maxPapers * 0.2)));
    const keepSet = new Set(recentKeep.map((p) => p.arxivId));
    const byImpact = [...filtered]
      .filter((p) => !keepSet.has(p.arxivId))
      .sort((a, b) => b.citationCount - a.citationCount || new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
    filtered = [...recentKeep, ...byImpact.slice(0, options.maxPapers - recentKeep.length)];
  }

  if (filtered.length === 0) return [];

  console.log(`[Academic] Summarizing ${filtered.length} papers via Gemini 4 Hydrogen (abstract-only)...`);
  const summaryMap = await generateShortSummariesBatch(filtered);

  console.log(`[Academic] Computing 768-dim embeddings for ${filtered.length} papers...`);
  const textsToEmbed = filtered.map((p) => {
    const s = summaryMap.get(p.arxivId);
    return `${p.title}\n${s?.summary || ''}\n${p.abstract.slice(0, 1200)}`;
  });
  const embeddings = await getEmbeddingsBatch(textsToEmbed, 15000);

  const papers: AcademicPaper[] = filtered.map((p, idx) => {
    const s = summaryMap.get(p.arxivId);
    const primaryCat = p.primaryCategory && ALLOWED_ARXIV_CATEGORIES.has(p.primaryCategory)
      ? p.primaryCategory
      : p.primaryCategory || 'cs.AI';
    const tags = extractTagsDeterministic(p.title, `${s?.summary || ''} ${p.abstract}`);

    return {
      title: p.title,
      link: `https://arxiv.org/abs/${p.arxivId}`,
      pdfUrl: `https://arxiv.org/pdf/${p.arxivId}.pdf`,
      arxivId: p.arxivId,
      date: p.publishedDate,
      source: 'arXiv',
      category: 'academic',
      primaryCategory: primaryCat,
      venue: `arXiv · ${primaryCat}`,
      authors: p.authors,
      abstract: p.abstract.slice(0, 2400),
      snippet: (s?.summary || p.abstract).slice(0, 380),
      summary: s?.summary || p.abstract.slice(0, 380),
      keyInnovation: s?.keyInnovation || undefined,
      significance: p.citationCount >= 50 ? 'breakthrough' : 'engineering',
      citationCount: p.citationCount,
      tags,
      embedding: embeddings[idx] || undefined,
    };
  });

  await saveAcademicPapers(papers, { skipGcsBackup: options?.skipGcsBackup });
  console.log(`[Academic] Saved ${papers.length} academic papers (abstract + short summary only).`);
  return papers;
}

// Cooldown guard for live on-demand academic refresh
let lastAcademicIngestAt = 0;
const ACADEMIC_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Live incremental academic ingestion (latest HF Daily Papers + newest arXiv cs.AI/cs.LG/cs.CL).
 */
export async function ingestLatestAcademicPapers(force = false): Promise<number> {
  if (!force && Date.now() - lastAcademicIngestAt < ACADEMIC_COOLDOWN_MS) {
    return 0;
  }
  lastAcademicIngestAt = Date.now();

  const candidates = new Map<string, RawAcademicCandidate>();
  const merge = (list: RawAcademicCandidate[]) => {
    for (const item of list) {
      const prev = candidates.get(item.arxivId);
      if (!prev) {
        candidates.set(item.arxivId, item);
      } else {
        prev.citationCount = Math.max(prev.citationCount, item.citationCount);
        if (!prev.primaryCategory && item.primaryCategory) prev.primaryCategory = item.primaryCategory;
        if (item.abstract.length > prev.abstract.length) prev.abstract = item.abstract;
        if (item.authors.length > prev.authors.length) prev.authors = item.authors;
      }
    }
  };

  const [hfLatest, arxivLatest] = await Promise.all([
    fetchHuggingFacePapers('limit=40'),
    fetchLatestArxivPapers(30),
  ]);
  merge(hfLatest);
  merge(arxivLatest);

  // Enrich missing categories via arXiv API (respects 3.2s delay)
  const needsEnrich = new Map<string, RawAcademicCandidate>();
  for (const [id, c] of Array.from(candidates.entries())) {
    if (!c.primaryCategory) needsEnrich.set(id, c);
  }
  if (needsEnrich.size > 0) {
    await delay(3200);
    await enrichWithArxivApi(needsEnrich);
  }

  const saved = await finalizeAndSaveAcademicCandidates(candidates, { maxPapers: 55 });
  return saved.length;
}
