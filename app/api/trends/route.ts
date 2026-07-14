import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// ---------------------------------------------------------------------------
// Module-level client — instantiated once, reused across all requests
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

const vertexModel = project
  ? new VertexAI({ project, location }).preview.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
        topP: 1,
        topK: 32,
        responseMimeType: 'application/json',
      },
    })
  : null;

// ---------------------------------------------------------------------------
// POST /api/trends
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  if (!vertexModel) {
    return NextResponse.json(
      { error: 'GOOGLE_CLOUD_PROJECT environment variable is not set.' },
      { status: 500 },
    );
  }

  try {
    const { titles } = await req.json();

    if (!titles || !Array.isArray(titles)) {
      return NextResponse.json({ error: 'Invalid titles provided' }, { status: 400 });
    }

    const prompt = `Analyze these AI research titles and generate a comprehensive, full-page style trend report.

Return a JSON object with keys:
- 'trends': array of objects with 'name' (topic) and 'value' (estimated relevance/frequency score from 1-100)
- 'summary': string (A detailed, multi-paragraph markdown report. Use H3 (###) for section headers. Include sections like "Executive Summary", "Key Emerging Themes", "Strategic Implications", and "Future Outlook". Make it sound professional and insightful.)

Titles:
${titles.join('\n')}`;

    const result = await vertexModel.generateContent(prompt);
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error('No response from Gemini');

    const data = JSON.parse(text);
    // Backward-compat: if model returns a bare array, wrap it
    if (Array.isArray(data)) {
      return NextResponse.json({ trends: data, summary: 'Trends analyzed from recent articles.' });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[api/trends] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to analyze trends' }, { status: 500 });
  }
}
