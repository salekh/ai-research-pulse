import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';
import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Module-level client
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';

const vertexModel = project
  ? new VertexAI({ project, location }).getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        temperature: 0.2,          // Factual, consistent summaries
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    })
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
          signal: AbortSignal.timeout(8000), // 8-second timeout to avoid blocking
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $('script, style, nav, footer, header, aside, .nav, .footer, .header, .menu, .sidebar, .comments, .related').remove();
          const mainText = $('main, article, .content, .post-content, .blog-post, .entry-content').text();
          content = (mainText || $('body').text()).replace(/\s+/g, ' ').trim().slice(0, 8000);
        }
      } catch (e) {
        console.error('[api/summarize] Failed to fetch article content:', e);
      }
    }

    const prompt = `You are an expert AI research analyst. Analyze the following research article and produce a structured summary.

Title: ${title}
Source snippet: ${snippet}
${content ? `\nExtracted article content (first 8000 chars):\n${content}` : ''}

Return a JSON object with exactly these keys:
{
  "summary": "A 2-3 sentence summary of the article. Be specific about what was done, not vague. Mention the method, dataset, or model name if available.",
  "keyInnovation": "One sentence describing the core technical contribution — what is new here that didn't exist before?",
  "significance": "One of: 'breakthrough' | 'incremental' | 'engineering' | 'survey'. 'breakthrough' = fundamentally new capability or major SOTA improvement. 'incremental' = solid improvement on existing work. 'engineering' = impressive system/infrastructure work. 'survey' = review or analysis of existing work.",
  "topics": ["1-3 topic tags from: LLM, Vision, Multimodal, RL, Robotics, Safety, Efficiency, Training, Inference, Data, Agents, Science, Audio, Code, Math"]
}

Prioritize the extracted article content if available; fall back to the snippet if not. Be precise and technical — your audience is ML engineers.`;

    const result = await vertexModel.generateContent(prompt);
    const candidates = result.response.candidates;
    if (!candidates || candidates.length === 0) throw new Error('No summary generated');
    const text = candidates[0].content.parts[0].text;
    if (!text) throw new Error('Empty response');

    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[api/summarize] Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
