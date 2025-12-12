import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

export async function POST(req: Request) {
  try {
    const { titles } = await req.json();

    if (!titles || !Array.isArray(titles)) {
      return NextResponse.json({ error: 'Invalid titles provided' }, { status: 400 });
    }

    // Initialize Vertex AI with ADC
    // Note: project and location will be inferred from ADC or defaults if not specified,
    // but usually it's better to specify them if known. 
    // Since we want to be generic, we might rely on gcloud config or environment variables.
    // However, VertexAI constructor requires project and location.
    // We'll try to use process.env.GOOGLE_CLOUD_PROJECT or similar if available, 
    // otherwise we might need the user to set it. 
    // BUT, for ADC to work seamlessly without hardcoding, we might need to assume a default or ask user.
    // Let's try to use a common default or check if we can omit it (SDK might require it).
    
    // Actually, VertexAI SDK usually requires project and location.
    // We will use a default location 'us-central1' and try to get project from env.
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    const location = 'us-central1'; // Reverted to us-central1 as global caused crash.

    if (!project) {
       // If no project is found, we can't initialize VertexAI easily without explicit config.
       // However, if the user ran `gcloud init`, the project is in the config, but Node SDK might not pick it up automatically without the env var.
       // We'll return a helpful error.
       return NextResponse.json({ 
         error: 'GOOGLE_CLOUD_PROJECT environment variable is not set. Please set it to your Google Cloud Project ID.' 
       }, { status: 500 });
    }

    const vertex_ai = new VertexAI({ project: project, location: location });
    const model = vertex_ai.preview.getGenerativeModel({
      model: 'gemini-2.5-pro', // User requested gemini-2.5-pro
      generationConfig: {
        'maxOutputTokens': 8192, // Increased for comprehensive report
        'temperature': 0.4,
        'topP': 1,
        'topK': 32,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `Analyze these AI research titles and generate a comprehensive, full-page style trend report.
      
      Return a JSON object with keys:
      - 'trends': array of objects with 'name' (topic) and 'value' (estimated relevance/frequency score from 1-100)
      - 'summary': string (A detailed, multi-paragraph markdown report. Use H3 (###) for section headers. Include sections like "Executive Summary", "Key Emerging Themes", "Strategic Implications", and "Future Outlook". Make it sound professional and insightful.)
      
      Titles:
      ${titles.join('\n')}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    const data = JSON.parse(text);
    // Ensure we return the expected structure even if the model varies slightly (though JSON mode is strict)
    // If the model returns just an array (old behavior), wrap it.
    if (Array.isArray(data)) {
        return NextResponse.json({ trends: data, summary: "Trends analyzed from recent articles." });
    }
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Trend analysis failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to analyze trends' }, { status: 500 });
  }
}
