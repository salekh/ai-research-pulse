import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// Module-level client — uses @google/genai with Vertex AI backend
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    if (!project) throw new Error('[trends] GOOGLE_CLOUD_PROJECT is not set');
    _ai = new GoogleGenAI({ vertexai: true, project, location });
  }
  return _ai;
}

// ---------------------------------------------------------------------------
// POST /api/trends
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  if (!project) {
    return NextResponse.json(
      { error: 'GOOGLE_CLOUD_PROJECT environment variable is not set.' },
      { status: 500 },
    );
  }

  try {
    const { titles, snippets, sources } = await req.json();

    if (!titles || !Array.isArray(titles)) {
      return NextResponse.json({ error: 'Invalid titles provided' }, { status: 400 });
    }

    // Build rich article context — use snippets and sources if available
    const articlesContext = titles
      .map((title: string, i: number) => {
        const parts = [`[${i + 1}] "${title}"`];
        if (sources?.[i]) parts.push(`(${sources[i]})`);
        if (snippets?.[i]) parts.push(`\n    ${snippets[i].substring(0, 200)}`);
        return parts.join(' ');
      })
      .join('\n');

    const prompt = `You are a senior AI research strategist analyzing ${titles.length} recent publications from major AI labs (Google, OpenAI, Anthropic, Meta, Microsoft, x.AI).

Perform a rigorous trend analysis and return a JSON object with these keys:

{
  "trends": [
    {
      "name": "Topic Name (2-4 words, e.g. 'Long-Context Models')",
      "value": <number 1-100>,
      "signal": "<one of: emerging | growing | established | declining>",
      "labs": ["List of labs publishing in this area from the input"]
    }
  ],
  "summary": "<A detailed markdown report (see structure below)>"
}

**Scoring rubric for 'value':**
- Frequency (40%): How many articles touch this topic?
- Breadth (30%): How many different labs are publishing on it?
- Novelty (30%): Is this a new direction (score higher) or well-trodden ground (score lower)?

**Signal definitions:**
- emerging: <3 papers but from multiple labs — early convergence signal
- growing: 3+ papers, increasing lab diversity — active area of investment
- established: Many papers, all major labs — core infrastructure/capability
- declining: Fewer papers than expected given historical activity

**Summary structure (use ### headers, write in markdown):**
### Executive Summary
2-3 sentences on the dominant theme across all articles.

### Cross-Lab Convergence
Which topics are multiple labs independently pursuing? What does this signal about the field's direction?

### Key Emerging Themes
What's new or surprising in this batch? Highlight topics in "emerging" or "growing" status.

### Notable Gaps
What major areas are conspicuously absent from recent publications?

### Strategic Outlook
What do these trends suggest about the next 6-12 months?

Return exactly 5-8 trends, sorted by 'value' descending.

Articles:
${articlesContext}`;

    const result = await getAI().models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        topP: 0.95,
        responseMimeType: 'application/json',
      },
    });

    const text = result.text;
    if (!text) throw new Error('No response from Gemini');

    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return NextResponse.json({ trends: data, summary: 'Trends analyzed from recent articles.' });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[api/trends] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to analyze trends' }, { status: 500 });
  }
}
