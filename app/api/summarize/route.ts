import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getCachedSummary, saveCachedSummary } from '@/lib/db';
import { generateContentWithFallback } from '@/lib/vertex';
import { extractTagsDeterministic } from '@/lib/ingestion';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB cap per CONSTITUTION.md Art. VII §1

function isSafePublicUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === 'metadata.google.internal' ||
      host === 'metadata' ||
      host.endsWith('.internal') ||
      host.endsWith('.local') ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host === '0.0.0.0' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    ) {
      return null;
    }

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return null;
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error('Article response exceeds 2MB cap');
  }
  if (!res.body) {
    const text = await res.text();
    return text.slice(0, maxBytes);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      if (total + value.byteLength > maxBytes) {
        const remaining = maxBytes - total;
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        await reader.cancel();
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  }
  return Buffer.concat(chunks, total).toString('utf-8');
}

export async function POST(request: Request) {
  try {
    const { title, snippet, link } = await request.json();

    if (!title) {
      return NextResponse.json({ error: 'Missing article title' }, { status: 400 });
    }

    // 1. Check permanent database cache first (<2ms response)
    if (link) {
      const cached = await getCachedSummary(link);
      if (cached && cached.summary) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // 2. Best-effort SSRF-validated scrape of full article text (<= 2 MB, 6s timeout)
    let content = '';
    const safeUrl = typeof link === 'string' ? isSafePublicUrl(link) : null;
    if (safeUrl) {
      try {
        const res = await fetch(safeUrl.toString(), {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(6000),
          redirect: 'follow',
        });
        const finalUrl = res.url ? isSafePublicUrl(res.url) : safeUrl;
        if (res.ok && finalUrl) {
          const html = await readBoundedText(res, MAX_HTML_BYTES);
          const $ = cheerio.load(html);
          $(
            'script, style, nav, footer, header, aside, .nav, .footer, .header, .menu, .sidebar, .comments, .related, [class*="transcriber"], [class*="Consent"]'
          ).remove();
          const mainText = $(
            '[class*="max-w-article"], main, article, .content, .post-content, .blog-post, .entry-content'
          )
            .first()
            .text();
          content = (mainText || $('body').text())
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000);
        }
      } catch {}
    }

    const prompt = `You are an expert AI research analyst. Analyze the following research article and produce a structured summary.

Title: ${title}
Source snippet: ${snippet}
${content ? `\nExtracted article content (first 8000 chars):\n${content}` : ''}

Return a JSON object with exactly these keys:
{
  "summary": "A 2-3 sentence summary of the article. Be specific about what was done, not vague. Mention the method, dataset, or model name if available.",
  "keyInnovation": "One sentence describing the core technical contribution — what is new here that didn't exist before?",
  "significance": "One of: 'breakthrough' | 'incremental' | 'engineering' | 'survey'.",
  "topics": ["1-3 topic tags from: LLM, Vision, Multimodal, RL, Robotics, Safety, Efficiency, Training, Inference, Data, Agents, Science, Audio, Code, Math"]
}

Prioritize the extracted article content if available; fall back to the snippet if not. Be precise and technical — your audience is ML engineers.`;

    try {
      const { text, modelUsed } = await generateContentWithFallback({
        contents: prompt,
        tier: 'hydrogen',
        thinkingLevel: 'LOW',
        config: {
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(text);
      if (link && parsed.summary) {
        await saveCachedSummary(link, parsed);
      }
      return NextResponse.json({ ...parsed, modelUsed });
    } catch {
      // Deterministic executive synthesis fallback if Vertex AI is offline or requires reauth.
      // Intentionally NOT persisted to cached_summaries so a real Gemini 4 summary can succeed later.
      const cleanBody = String(content || snippet || title || '');
      const sentences = cleanBody
        .split(/(?<=[.!?])\s+/)
        .filter((s: string) => s.length > 35 && !s.toLowerCase().includes('cookie'));
      const synthesizedSummary =
        sentences.slice(0, 3).join(' ') ||
        `Technical publication investigating ${title}. Focuses on empirical evaluation, architectural optimization, and reproducibility across frontier AI benchmarks.`;
      const keyInnovation =
        sentences[0] ||
        `Introduces a structured methodology for ${title.toLowerCase()}, improving reliability and computational efficiency.`;
      const topics = extractTagsDeterministic(title, cleanBody);
      const fallbackData = {
        summary: synthesizedSummary,
        keyInnovation,
        significance:
          title.toLowerCase().includes('introducing') || title.toLowerCase().includes('system card')
            ? 'breakthrough'
            : 'engineering',
        topics,
      };
      return NextResponse.json({
        ...fallbackData,
        modelUsed: 'deterministic-fallback',
        fallback: true,
      });
    }
  } catch (error) {
    console.error('[api/summarize] Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
