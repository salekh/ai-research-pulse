import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { generateContentWithFallback } from '@/lib/vertex';
import {
  A2UIApiResponse,
  A2UIMessage,
  A2UI_MIME_TYPE,
  A2UI_PROTOCOL_VERSION,
  ArticleInput,
  BASIC_CATALOG_ID,
  RESEARCH_BRIEF_CATALOG_ID,
} from '@/lib/a2ui/spec';
import {
  buildFallbackA2UIBrief,
  buildSurfaceId,
  sanitizeExternalUrl,
  sanitizePlainText,
  validateA2UIPayload,
} from '@/lib/a2ui/validator';

// ============================================================================
// In-Memory LRU Cache for Validated A2UI 1.0 Visual Briefs
// ============================================================================

const CACHE_MAX_ENTRIES = 128;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CachedEntry {
  response: A2UIApiResponse;
  expiresAt: number;
}

const globalForA2UI = globalThis as unknown as {
  __a2uiBriefCache?: Map<string, CachedEntry>;
};

const briefCache: Map<string, CachedEntry> =
  globalForA2UI.__a2uiBriefCache || new Map<string, CachedEntry>();
globalForA2UI.__a2uiBriefCache = briefCache;

function normalizeCacheKey(link: string | undefined, title: string): string {
  const base = (link || title).trim().toLowerCase().replace(/\/+$/, '');
  return base;
}

function getFromCache(key: string): A2UIApiResponse | null {
  const entry = briefCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    briefCache.delete(key);
    return null;
  }
  // Refresh LRU recency
  briefCache.delete(key);
  briefCache.set(key, entry);
  return { ...entry.response, cached: true };
}

function setInCache(key: string, response: A2UIApiResponse): void {
  if (briefCache.has(key)) {
    briefCache.delete(key);
  } else if (briefCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = briefCache.keys().next().value;
    if (oldestKey) briefCache.delete(oldestKey);
  }
  briefCache.set(key, {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ============================================================================
// SSRF-Hardened Article Scraper (CONSTITUTION.md Article VII §1)
// ============================================================================

const MAX_FETCH_BYTES = 512 * 1024; // 512 KB
const FETCH_TIMEOUT_MS = 6000;

function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (clean === '::1' || clean === '::' || clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const v4 = clean.startsWith('::ffff:') ? clean.slice(7) : clean;
  if (net.isIPv4(v4)) {
    const parts = v4.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

async function isSafePublicUrl(rawUrl: string): Promise<string | null> {
  const safe = sanitizeExternalUrl(rawUrl);
  if (!safe) return null;

  let parsed: URL;
  try {
    parsed = new URL(safe);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === 'metadata'
  ) {
    return null;
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) return null;
    return parsed.toString();
  }

  try {
    const lookup = await dns.lookup(host, { all: true });
    if (!lookup.length) return null;
    for (const addr of lookup) {
      if (isPrivateOrReservedIp(addr.address)) return null;
    }
  } catch {
    return null;
  }

  return parsed.toString();
}

async function fetchArticleTextSafe(safePublicUrl: string | null): Promise<string> {
  if (!safePublicUrl) return '';
  let currentUrl = safePublicUrl;

  try {
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(currentUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status >= 300 && res.status < 400) {
        const locationHeader = res.headers.get('location');
        if (!locationHeader) return '';
        let resolvedHop: string;
        try {
          resolvedHop = new URL(locationHeader, currentUrl).toString();
        } catch {
          return '';
        }
        const safeHop = await isSafePublicUrl(resolvedHop);
        if (!safeHop) return '';
        currentUrl = safeHop;
        continue;
      }
      break;
    }

    if (!res || !res.ok) return '';

    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (received >= MAX_FETCH_BYTES) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      html += decoder.decode();
    } else {
      html = (await res.text()).slice(0, MAX_FETCH_BYTES);
    }

    const $ = cheerio.load(html);
    $(
      'script, style, noscript, iframe, svg, nav, footer, header, aside, .nav, .footer, .header, .menu, .sidebar, .comments, .related, [class*="transcriber"], [class*="Consent"], [class*="cookie"]'
    ).remove();
    const mainText = $(
      '[class*="max-w-article"], main, article, .content, .post-content, .blog-post, .entry-content'
    )
      .first()
      .text();

    return (mainText || $('body').text())
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 9000);
  } catch {
    return '';
  }
}

// ============================================================================
// A2UI 1.0 Prompt Builder & JSON Extractor
// ============================================================================

function buildA2UIPrompt(
  article: ArticleInput,
  surfaceId: string,
  safeLink: string,
  extractedText: string
): string {
  const formattedDate = (() => {
    try {
      const d = new Date(article.date);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    } catch {}
    return sanitizePlainText(article.date) || 'Recent';
  })();

  const tags = (article.tags || []).slice(0, 5).map(sanitizePlainText).filter(Boolean);

  return `You are an expert Frontier AI Research Architect producing a publication-grade visual research brief strictly encoded as an **A2UI v1.0** JSON message array.

## Article Input
- Title: ${sanitizePlainText(article.title)}
- Source Lab: ${sanitizePlainText(article.source)}
- Publication Date: ${formattedDate}
- Canonical Link: ${safeLink}
- Tags: ${tags.length ? tags.join(', ') : 'Frontier AI'}
- Existing Summary: ${sanitizePlainText(article.summary || article.snippet || '')}
- Key Innovation: ${sanitizePlainText(article.keyInnovation || '')}
${extractedText ? `\n## Extracted Full Article Text (up to 9,000 chars)\n${extractedText}` : ''}

## Strict Grounding & Zero-Hallucination Rules
1. Base EVERY technical claim, metric, benchmark, and comparison strictly on the provided article input and extracted text.
2. NEVER fabricate benchmark numbers, accuracy percentages, parameter counts, or speedup ratios. If exact numerical metrics are not reported in the text, surface high-signal qualitative dimensions (e.g., Architecture Pattern, Target Domain, Primary Innovation, Deployment Lens) or explicitly write "Not reported in excerpt".
3. Never output raw HTML tags or scripts in any string value.

## Strict A2UI v1.0 Protocol Contract
Return ONLY a JSON array of exactly 3 A2UI v1.0 messages:
1. \`createSurface\`:
   \`{ "version": "1.0", "createSurface": { "surfaceId": "${surfaceId}", "catalogId": "${BASIC_CATALOG_ID}", "sendDataModel": false } }\`
   (NEVER include a "theme" property — forbidden in v1.0.)
2. \`updateDataModel\`:
   \`{ "version": "1.0", "updateDataModel": { "surfaceId": "${surfaceId}", "path": "/", "value": { ... } } }\`
   Populate a rich structured data model with:
   - \`article\`: \`{ title, source, date: "${formattedDate}", link: "${safeLink}", significance, subtitle, tags }\`
     - **CRITICAL**: \`article.significance\` MUST be a concise 1–2 word badge label ONLY (choose one of: \`"Breakthrough"\`, \`"Architecture"\`, \`"Engineering"\`, \`"Evaluation"\`, \`"Systems"\`, \`"Safety"\`, \`"Survey"\` — strictly <= 20 characters, NEVER a phrase or sentence!). Put any descriptive tagline in \`article.subtitle\`.
   - \`synthesis\`: \`{ innovationTitle, innovationBody, summary }\` (2-4 crisp technical sentences)
   - \`metrics\`: array of 3 objects \`{ label, value, delta, context, accent }\` where \`accent\` is one of \`"blue" | "green" | "yellow" | "red" | "dark"\`. Keep \`value\` concise (<= 24 chars) so KPI cards typeset cleanly.
   - \`pipeline\`: array of 3-5 methodology/architecture stages \`{ step: "01", title, detail, tag }\`
   - \`comparison\`: \`{ columns: [3-4 short headers], rows: [3-5 comparative rows matching column count] }\`
   - \`takeaways\`: \`{ title, body }\`
   - \`caveats\`: \`{ title, body }\`
   - \`deepDive\`: \`{ title, badge, body }\` (concrete technical detail, implementation nuances, or experimental setup from the article)
3. \`updateComponents\`:
   \`{ "version": "1.0", "updateComponents": { "surfaceId": "${surfaceId}", "components": [ ... ] } }\`
   - Flat adjacency list; MUST include \`"id": "root"\` (a \`Column\`).
   - NEVER use \`"component": "Surface"\`.
   - Basic Catalog components (inherit surface default catalogId):
     - \`Column\`: \`{ id, component: "Column", children: ["id1", ...] }\`
     - \`Row\`: \`{ id, component: "Row", justify?: "spaceBetween"|"start", align?: "center", children: ["id1", ...] }\`
     - \`Card\`: \`{ id, component: "Card", child: "<singleComponentId>" }\` (MUST be singular \`child\`, NEVER \`children\`)
     - \`List\`: \`{ id, component: "List", direction: "horizontal", children: { componentId: "metric_card_tpl", path: "/metrics" } }\` (unprefixed \`path\` on \`ChildList\` template)
     - \`Tabs\`: \`{ id, component: "Tabs", tabs: [{ title: "...", child: "<panelId>" }, ...] }\` (3 meaningful tabs tailored to the paper: e.g., Architecture & Methodology, Comparative Breakdown, Takeaways & Deep Dive)
     - \`Divider\`: \`{ id, component: "Divider", axis: "horizontal" }\`
     - \`Text\`: \`{ id, component: "Text", variant: "body" | "caption", text: string | { "@path": "..." } | { "@call": "formatString", args: { value: "..." } } }\`
     - \`Button\`: \`{ id, component: "Button", variant: "primary"|"default"|"borderless", child: "<textComponentId>", action: { functionCall: { "@call": "openUrl", args: { url: { "@path": "/article/link" } } } } }\` (MUST use \`child\` pointing to a \`Text\` node ID — NEVER \`label\` or \`text\` directly on Button!)
   - Extension Catalog components — EVERY ONE MUST include \`"catalogId": "${RESEARCH_BRIEF_CATALOG_ID}"\`:
     - \`HeroBanner\`: \`{ id, catalogId, component: "HeroBanner", title, source, date, significance, subtitle, tags }\` (bound via \`{ "@path": "/article/..." }\`)
     - \`Heading\`: \`{ id, catalogId, component: "Heading", level: 2|3, eyebrow?, text }\`
     - \`MetricCard\`: \`{ id, catalogId, component: "MetricCard", label: { "@path": "label" }, value: { "@path": "value" }, delta: { "@path": "delta" }, context: { "@path": "context" }, accent: { "@path": "accent" } }\`
     - \`Callout\`: \`{ id, catalogId, component: "Callout", tone: "innovation"|"info"|"success"|"warning", title, body }\`
     - \`StepFlow\`: \`{ id, catalogId, component: "StepFlow", title, steps: { "@path": "/pipeline" } }\`
     - \`DataTable\`: \`{ id, catalogId, component: "DataTable", caption, columns: { "@path": "/comparison/columns" }, rows: { "@path": "/comparison/rows" } }\`
     - \`Collapsible\`: \`{ id, catalogId, component: "Collapsible", title, badge?, defaultOpen?: false, child: "<singleComponentId>" }\` (MUST use singular \`child\` pointing to a \`Text\` or \`Column\` node ID — NEVER \`body\` or \`children\`!)
     - \`Badge\`: \`{ id, catalogId, component: "Badge", label, tone? }\`
   - End with a \`Divider\` and citation footer \`Row\` containing a \`Text\` (variant \`"caption"\` using \`{ "@call": "formatString", "args": { "value": "Source: \${/article/source} · \${/article/date}" } }\`) and a primary \`Button\` with \`child: "source_button_label"\` (a \`Text\` node with \`text: "Open Original Publication"\`) and \`action: { "functionCall": { "@call": "openUrl", "args": { "url": { "@path": "/article/link" } } } }\`.

Output raw valid JSON array only (no markdown fences, no commentary).`;
}

function extractMessagesFromModelText(rawText: string): A2UIMessage[] | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed as A2UIMessage[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { messages?: unknown }).messages)) {
    return (parsed as { messages: A2UIMessage[] }).messages;
  }
  return null;
}

function normalizeSignificanceBadge(raw: unknown): string {
  const clean = sanitizePlainText(raw);
  if (!clean) return 'Research';
  if (clean.length <= 22 && clean.split(/\s+/).length <= 2) {
    return clean;
  }
  const lower = clean.toLowerCase();
  if (/breakthrough|frontier|flagship|foundation|release/.test(lower)) return 'Breakthrough';
  if (/architect|orchestrat|framework|pipeline|model|agent/.test(lower)) return 'Architecture';
  if (/eval|benchmark|empirical|study/.test(lower)) return 'Evaluation';
  if (/safety|align|interpret|guard/.test(lower)) return 'Safety';
  if (/survey|review|overview/.test(lower)) return 'Survey';
  return 'Engineering';
}

/**
 * Ensures the canonical SSRF-validated article URL is locked into the surface data model
 * and enforces concise 1–2 word significance badges so HeroBanner layout stays crisp.
 */
function normalizeAndLockArticleDataModel(messages: A2UIMessage[], safeLink: string): void {
  const patchArticle = (articleObj: Record<string, unknown>) => {
    articleObj.link = safeLink;
    if ('significance' in articleObj) {
      articleObj.significance = normalizeSignificanceBadge(articleObj.significance);
    }
  };

  for (const msg of messages) {
    if ('updateDataModel' in msg) {
      const val = msg.updateDataModel.value;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const record = val as Record<string, unknown>;
        if (record.article && typeof record.article === 'object' && !Array.isArray(record.article)) {
          patchArticle(record.article as Record<string, unknown>);
        }
      }
    } else if ('createSurface' in msg && msg.createSurface.dataModel) {
      const dm = msg.createSurface.dataModel;
      if (dm.article && typeof dm.article === 'object' && !Array.isArray(dm.article)) {
        patchArticle(dm.article as Record<string, unknown>);
      }
    }
  }
}

// ============================================================================
// POST /api/a2ui
// ============================================================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = sanitizePlainText(body?.title);
    const link = typeof body?.link === 'string' ? body.link.trim() : '';
    const source = sanitizePlainText(body?.source) || 'Frontier AI Lab';
    const date = typeof body?.date === 'string' ? body.date : new Date().toISOString();
    const snippet = typeof body?.snippet === 'string' ? body.snippet : '';
    const summary = typeof body?.summary === 'string' ? body.summary : '';
    const keyInnovation =
      typeof body?.keyInnovation === 'string' ? body.keyInnovation : '';
    const significance =
      typeof body?.significance === 'string' ? body.significance : '';
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 8)
      : [];
    const refresh = Boolean(body?.refresh);
    const tier = body?.tier === 'carbon' ? 'carbon' : 'hydrogen';

    if (!title) {
      return NextResponse.json(
        { error: 'Missing required field: title' },
        { status: 400 }
      );
    }

    const safePublicLink = link ? await isSafePublicUrl(link) : null;
    const safeLink = safePublicLink || 'https://research.google/';

    const article: ArticleInput = {
      title,
      link: safeLink,
      source,
      date,
      snippet,
      summary,
      keyInnovation,
      significance,
      tags,
    };

    const cacheKey = normalizeCacheKey(safePublicLink || undefined, title);
    if (!refresh) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        return buildHttpResponse(cached, request);
      }
    }

    const surfaceId = buildSurfaceId(safePublicLink || title, title);
    const extractedText = await fetchArticleTextSafe(safePublicLink);

    try {
      const prompt = buildA2UIPrompt(article, surfaceId, safeLink, extractedText);
      const { text, modelUsed } = await generateContentWithFallback({
        contents: prompt,
        tier,
        thinkingLevel: tier === 'carbon' ? 'MEDIUM' : 'LOW',
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: tier === 'carbon' ? 8192 : 6144,
        },
      });

      const messages = extractMessagesFromModelText(text);
      if (messages) {
        normalizeAndLockArticleDataModel(messages, safeLink);
        const validation = validateA2UIPayload(messages);
        if (validation.valid && validation.surface) {
          const responsePayload: A2UIApiResponse = {
            version: A2UI_PROTOCOL_VERSION,
            surfaceId: validation.surface.surfaceId,
            messages,
            modelUsed,
            cached: false,
            fallback: false,
            generatedAt: new Date().toISOString(),
            ...(validation.warnings.length > 0
              ? { validationWarnings: validation.warnings }
              : {}),
          };
          setInCache(cacheKey, responsePayload);
          return buildHttpResponse(responsePayload, request);
        }
        console.warn(
          '[api/a2ui] LLM payload failed strict A2UI 1.0 validation, using deterministic fallback:',
          validation.errors.slice(0, 3)
        );
      }
    } catch (aiErr: unknown) {
      const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.warn(
        '[api/a2ui] Gemini 4 generation failed, using deterministic A2UI 1.0 fallback:',
        errMsg.slice(0, 160)
      );
    }

    // Guaranteed-valid deterministic A2UI 1.0 fallback (intentionally NOT cached so subsequent retries get live Gemini 4 output)
    const fallback = buildFallbackA2UIBrief(article, extractedText);
    const fallbackCheck = validateA2UIPayload(fallback.messages);
    const fallbackPayload: A2UIApiResponse = {
      version: A2UI_PROTOCOL_VERSION,
      surfaceId: fallback.surfaceId,
      messages: fallback.messages,
      modelUsed: 'deterministic-a2ui-v1',
      cached: false,
      fallback: true,
      generatedAt: new Date().toISOString(),
      ...(fallbackCheck.warnings.length > 0
        ? { validationWarnings: fallbackCheck.warnings }
        : {}),
    };
    return buildHttpResponse(fallbackPayload, request);
  } catch (error) {
    console.error('[api/a2ui] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to generate A2UI 1.0 visual brief' },
      { status: 500 }
    );
  }
}

function buildHttpResponse(payload: A2UIApiResponse, request: Request): NextResponse {
  const accept = request.headers.get('accept') || '';
  if (accept.includes(A2UI_MIME_TYPE)) {
    return new NextResponse(JSON.stringify(payload.messages), {
      status: 200,
      headers: {
        'Content-Type': `${A2UI_MIME_TYPE}; charset=utf-8`,
        'X-A2UI-Version': A2UI_PROTOCOL_VERSION,
        'X-A2UI-Model': payload.modelUsed,
        'X-A2UI-Cached': String(payload.cached),
        'X-A2UI-Fallback': String(payload.fallback),
      },
    });
  }
  return NextResponse.json(payload, {
    headers: {
      'X-A2UI-Version': A2UI_PROTOCOL_VERSION,
    },
  });
}
