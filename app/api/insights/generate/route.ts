import { NextRequest, NextResponse } from 'next/server';
import { generateTranscript, synthesizeAudio } from '@/lib/audio-generator';

export async function POST(req: NextRequest) {
  try {
    const { articles, type } = await req.json();

    if (!articles || articles.length === 0) {
      return NextResponse.json({ error: 'No articles selected' }, { status: 400 });
    }

    // Step 1: Generate Transcript
    console.log("Generating transcript...");
    const transcript = await generateTranscript(articles, type);
    console.log("Transcript generated.");

    // Step 2: Generate Audio
    console.log("Generating audio...");
    const audioBuffer = await synthesizeAudio(transcript, type);
    console.log("Audio generated.");

    return new NextResponse(new Blob([new Uint8Array(audioBuffer)]), {
        headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': audioBuffer.length.toString(),
        }
    });

  } catch (error: any) {
    console.error('Error generating insight:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
