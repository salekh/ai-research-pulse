import { NextRequest, NextResponse } from 'next/server';
import {
  generateTranscriptWithModel,
  synthesizeAudio,
} from '@/lib/audio-generator';

export async function POST(req: NextRequest) {
  try {
    const { articles, type } = await req.json();

    if (!articles || articles.length === 0) {
      return NextResponse.json({ error: 'No articles selected' }, { status: 400 });
    }

    const insightType = type === 'podcast' ? 'podcast' : 'overview';

    // Step 1: Generate Transcript (Carbon for podcast dialogue, Hydrogen for executive overview)
    console.log(`[insights/generate] Generating ${insightType} transcript...`);
    const { transcript, modelUsed: scriptModel } = await generateTranscriptWithModel(
      articles,
      insightType
    );
    console.log(`[insights/generate] Transcript generated via ${scriptModel}.`);

    // Step 2: Synthesize Audio (gemini-3.8-flash-tts for podcast, gemini-3.8-flash-lite-tts for overview)
    console.log(`[insights/generate] Synthesizing ${insightType} audio...`);
    const { buffer: audioBuffer, modelUsed: ttsModel } = await synthesizeAudio(
      transcript,
      insightType
    );
    console.log(`[insights/generate] Audio generated via ${ttsModel} (${audioBuffer.length} bytes).`);

    return new NextResponse(new Blob([new Uint8Array(audioBuffer)]), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.length.toString(),
        'X-Model-Used': ttsModel,
        'X-Script-Model': scriptModel,
      },
    });
  } catch (error: any) {
    console.error('[insights/generate] Error generating insight:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
