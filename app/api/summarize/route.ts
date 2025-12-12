import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

import * as cheerio from 'cheerio';

export async function POST(request: Request) {
  try {
    const { title, snippet, link } = await request.json();
    
    let content = '';
    if (link) {
      try {
        const res = await fetch(link, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          // Remove script, style, nav, footer, header to reduce noise
          $('script, style, nav, footer, header, aside, .nav, .footer, .header, .menu').remove();
          // Try to find the main content container
          const mainText = $('main, article, .content, .post-content, .blog-post').text();
          content = (mainText || $('body').text()).replace(/\s+/g, ' ').trim().slice(0, 20000); // Limit to 20k chars
        }
      } catch (e) {
        console.error('Failed to fetch article content:', e);
        // Fallback to snippet if fetch fails
      }
    }

    // Initialize Vertex AI
    const project = process.env.GOOGLE_CLOUD_PROJECT || 'sa-learning-1';
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const vertex_ai = new VertexAI({ project: project, location: location });
    const model = vertex_ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Please provide a concise, 2-3 sentence summary of the following AI research article. Focus on the key innovation and its potential impact.
    
    Title: ${title}
    Snippet: ${snippet}
    ${content ? `Full Article Content: ${content}` : ''}
    
    If the full content is available, use it to provide a more accurate summary. If not, rely on the snippet.`;

    const result = await model.generateContent(prompt);
    if (!result.response.candidates || result.response.candidates.length === 0) {
      throw new Error('No summary generated');
    }
    const summary = result.response.candidates[0].content.parts[0].text;

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
