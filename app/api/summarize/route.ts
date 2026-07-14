import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';
import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Module-level client — instantiated once, reused across all requests
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

const vertexModel = project
  ? new VertexAI({ project, location }).getGenerativeModel({ model: 'gemini-3.5-flash' })
  : null;

// ---------------------------------------------------------------------------
// POST /api/summarize
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  if (!vertexModel) {
    return NextResponse.json(
      { error: 'GOOGLE_CLOUD_PROJECT environment variable is not set.' },
      { status: 500 },
    );
  }

  try {
    const { title, snippet, link } = await request.json();

    // Best-effort: fetch the full article HTML and extract text
    let content = '';
    if (link) {
      try {
        const res = await fetch(link, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $('script, style, nav, footer, header, aside, .nav, .footer, .header, .menu').remove();
          const mainText = $('main, article, .content, .post-content, .blog-post').text();
          content = (mainText || $('body').text()).replace(/\s+/g, ' ').trim().slice(0, 20000);
        }
      } catch (e) {
        console.error('[api/summarize] Failed to fetch article content:', e);
      }
    }

    const prompt = `Please provide a concise, 2-3 sentence summary of the following AI research article. Focus on the key innovation and its potential impact.

Title: ${title}
Snippet: ${snippet}
${content ? `Full Article Content: ${content}` : ''}

If the full content is available, use it to provide a more accurate summary. If not, rely on the snippet.`;

    const result = await vertexModel.generateContent(prompt);
    const candidates = result.response.candidates;
    if (!candidates || candidates.length === 0) throw new Error('No summary generated');
    const summary = candidates[0].content.parts[0].text;

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[api/summarize] Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
