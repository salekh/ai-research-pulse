import dns from 'node:dns/promises';
import net from 'node:net';
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { generateContentWithFallback, MODEL_REGISTRY } from '@/lib/vertex';
import { normalizeArxivId } from '@/lib/academic-ingestion';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_HTML_BYTES = 1_800_000;
const MAX_PAPER_CHARS = 26_000;
const MAX_ARTICLE_CHARS = 22_000;
const MAX_QUESTION_CHARS = 1_500;
const MAX_HISTORY_TURNS = 8;

type ContextSource = 'full-html' | 'article-body' | 'abstract-only';

interface EphemeralContextEntry {
  text: string;
  contextSource: ContextSource;
  cachedAt: number;
}

// Strictly ephemeral in-memory context cache (NEVER persisted to DB — honors abstract-only DB indexing)
const contextCache = new Map<string, EphemeralContextEntry>();
const CONTEXT_CACHE_MAX = 60;
const CONTEXT_CACHE_TTL_MS = 15 * 60 * 1000;

function isPrivateIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/i, '');
  const version = net.isIP(normalized);
  if (version === 4) {
    const [a, b] = normalized.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const low = normalized.toLowerCase();
    return (
      low === '::1' ||
      low === '::' ||
      low.startsWith('fc') ||
      low.startsWith('fd') ||
      low.startsWith('fe80:')
    );
  }
  return true;
}

async function isSafePublicUrl(rawUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      host === 'metadata'
    ) {
      return null;
    }
    if (net.isIP(host)) {
      return isPrivateIp(host) ? null : parsed.toString();
    }
    const addrs = await dns.lookup(host, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let total = 0;
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  out += decoder.decode();
  return out;
}

async function fetchCleanHtmlText(
  url: string,
  selectors: string,
  maxChars: number,
  timeoutMs = 7000
): Promise<string | null> {
  const safe = await isSafePublicUrl(url);
  if (!safe) return null;

  try {
    const res = await fetch(safe, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AI-Research-Pulse/3.1; +https://ai-research-pulse-710258046947.us-central1.run.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const finalSafe = res.url ? await isSafePublicUrl(res.url) : safe;
    if (!finalSafe) return null;

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml') && !ct.includes('text/plain')) {
      return null;
    }

    const html = await readBoundedText(res, MAX_HTML_BYTES);
    const $ = cheerio.load(html);
    $(
      'script, style, nav, footer, header, aside, noscript, svg, .nav, .footer, .header, .menu, .sidebar, .comments, .related, .ltx_bibliography, .ltx_page_navbar, .ltx_page_footer, [class*="transcriber"], [class*="Consent"]'
    ).remove();

    const mainText = $(selectors).first().text() || $('body').text();
    const cleaned = mainText
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length < 250) return null;
    return cleaned.slice(0, maxChars);
  } catch {
    return null;
  }
}

async function resolveGroundingContext(article: {
  title: string;
  link?: string;
  arxivId?: string;
  abstract?: string;
  summary?: string;
  snippet?: string;
  category?: string;
}): Promise<{ text: string; contextSource: ContextSource }> {
  const detectedArxivId =
    normalizeArxivId(article.arxivId || '') || normalizeArxivId(article.link || '');
  const cacheKey = detectedArxivId
    ? `arxiv:${detectedArxivId}`
    : `url:${(article.link || article.title).trim().toLowerCase()}`;

  const cached = contextCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CONTEXT_CACHE_TTL_MS) {
    return { text: cached.text, contextSource: cached.contextSource };
  }

  let fetchedText: string | null = null;
  let contextSource: ContextSource = 'abstract-only';

  if (detectedArxivId) {
    // On-demand arXiv HTML read (ephemeral — never stored in DB)
    fetchedText =
      (await fetchCleanHtmlText(
        `https://arxiv.org/html/${detectedArxivId}`,
        'article, .ltx_document, main',
        MAX_PAPER_CHARS,
        6500
      )) ||
      (await fetchCleanHtmlText(
        `https://ar5iv.labs.arxiv.org/html/${detectedArxivId}`,
        'article, .ltx_document, main',
        MAX_PAPER_CHARS,
        6500
      ));
    if (fetchedText) {
      contextSource = 'full-html';
    }
  } else if (article.link) {
    fetchedText = await fetchCleanHtmlText(
      article.link,
      '[class*="max-w-article"], main, article, .content, .post-content, .blog-post, .entry-content',
      MAX_ARTICLE_CHARS,
      6500
    );
    if (fetchedText) {
      contextSource = 'article-body';
    }
  }

  const fallbackText = [
    article.abstract ? `Abstract:\n${article.abstract}` : '',
    article.summary ? `Short Summary:\n${article.summary}` : '',
    !article.abstract && article.snippet ? `Excerpt:\n${article.snippet}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6000);

  const finalText = fetchedText || fallbackText || article.title;

  if (contextCache.size >= CONTEXT_CACHE_MAX) {
    const oldest = contextCache.keys().next().value;
    if (oldest) contextCache.delete(oldest);
  }
  contextCache.set(cacheKey, {
    text: finalText,
    contextSource,
    cachedAt: Date.now(),
  });

  return { text: finalText, contextSource };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const question =
      typeof body?.question === 'string'
        ? body.question.trim().slice(0, MAX_QUESTION_CHARS)
        : '';
    const article = body?.article;

    if (!question || !article || typeof article?.title !== 'string' || !article.title.trim()) {
      return NextResponse.json(
        { error: 'Both article.title and question are required.' },
        { status: 400 }
      );
    }

    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = rawHistory
      .filter(
        (m: any) =>
          (m?.role === 'user' || m?.role === 'assistant') &&
          typeof m?.content === 'string' &&
          m.content.trim().length > 0
      )
      .slice(-MAX_HISTORY_TURNS)
      .map((m: any) => ({
        role: m.role,
        content: m.content.trim().slice(0, 2500),
      }));

    const { text: groundingText, contextSource } = await resolveGroundingContext({
      title: article.title,
      link: typeof article.link === 'string' ? article.link : undefined,
      arxivId: typeof article.arxivId === 'string' ? article.arxivId : undefined,
      abstract: typeof article.abstract === 'string' ? article.abstract : undefined,
      summary: typeof article.summary === 'string' ? article.summary : undefined,
      snippet: typeof article.snippet === 'string' ? article.snippet : undefined,
      category: typeof article.category === 'string' ? article.category : undefined,
    });

    const isAcademic =
      article.category === 'academic' ||
      Boolean(article.arxivId) ||
      String(article.link || '').includes('arxiv.org');

    const authorsLine =
      Array.isArray(article.authors) && article.authors.length > 0
        ? `Authors: ${article.authors.slice(0, 8).join(', ')}`
        : '';
    const venueLine = article.venue
      ? `Venue/Track: ${article.venue}`
      : article.source
      ? `Source: ${article.source}`
      : '';
    const arxivLine = article.arxivId ? `arXiv ID: ${article.arxivId}` : '';

    const systemInstruction = `You are a Principal AI Research Scientist assisting an ML engineer interrogating a specific ${
      isAcademic ? 'academic research paper' : 'frontier AI lab publication'
    }.

STRICT GROUNDING & CITATION RULES:
1. Ground EVERY technical claim, equation, architecture detail, hyperparameter, and benchmark strictly in the provided source text (${
      contextSource === 'full-html'
        ? 'full paper HTML extracted on-demand from arXiv'
        : contextSource === 'article-body'
        ? 'extracted article body'
        : 'paper abstract and summary only'
    }).
2. NEVER fabricate numbers, benchmark scores, ablation results, or implementation details not present in the provided text.
3. If the user asks for a detail not stated in the provided ${
      contextSource === 'abstract-only' ? 'abstract/summary' : 'text'
    }, state that transparently in one clear sentence (e.g., "Not reported in the available abstract — check the linked PDF for full experimental details") and provide whatever related methodology IS grounded.
4. Write crisp, high-signal technical markdown (bullet lists, bold key terms, compact comparison tables when helpful). Keep answers direct, thorough, and jargon-accurate.
5. Return valid JSON with exactly these keys:
{
  "answer": "<markdown answer>",
  "suggestedFollowUps": ["<short specific follow-up question 1>", "<short specific follow-up question 2>", "<short specific follow-up question 3>"]
}`;

    const historyBlock =
      history.length > 0
        ? `\nPrior Conversation:\n${history
            .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
            .join('\n')}\n`
        : '';

    const prompt = `Publication Metadata:
Title: ${article.title}
${venueLine}
${authorsLine}
${arxivLine}
Date: ${article.date || 'Unknown'}
Canonical Link: ${article.link || 'N/A'}
${article.pdfUrl ? `PDF Link: ${article.pdfUrl}` : ''}
${article.abstract ? `\nAbstract:\n${article.abstract}` : ''}
${article.summary ? `\nShort Summary:\n${article.summary}` : ''}

Grounding Source Text (${contextSource}):
${groundingText}
${historyBlock}
User Question:
${question}`;

    const { text, modelUsed } = await generateContentWithFallback({
      contents: prompt,
      tier: 'neon',
      thinkingLevel: 'MEDIUM',
      config: {
        systemInstruction,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    let answer = '';
    let suggestedFollowUps: string[] = [];
    try {
      const parsed = JSON.parse(text);
      answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : text.trim();
      if (Array.isArray(parsed?.suggestedFollowUps)) {
        suggestedFollowUps = parsed.suggestedFollowUps
          .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 5)
          .slice(0, 3);
      }
    } catch {
      answer = text.trim();
    }

    if (suggestedFollowUps.length === 0) {
      suggestedFollowUps = [
        'What are the main limitations or failure modes noted?',
        'How does the methodology compare to prior baselines?',
        'What are the practical compute or deployment trade-offs?',
      ];
    }

    return NextResponse.json({
      answer,
      suggestedFollowUps,
      modelUsed: modelUsed || MODEL_REGISTRY.NEON,
      contextSource,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error('[api/ask] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to answer question about this paper.' },
      { status: 500 }
    );
  }
}
