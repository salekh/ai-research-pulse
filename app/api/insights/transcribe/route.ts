import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { transcribeAudio } from '@/lib/audio-generator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audioUrl, base64Audio, mimeType = 'audio/wav' } = body;

    let audioBuffer: Buffer | null = null;

    if (base64Audio && typeof base64Audio === 'string') {
      audioBuffer = Buffer.from(base64Audio, 'base64');
    } else if (audioUrl && typeof audioUrl === 'string') {
      // Handle local public paths like /insights/current-week/overview.wav
      if (audioUrl.startsWith('/')) {
        const localPath = path.join(process.cwd(), 'public', audioUrl);
        if (fs.existsSync(localPath)) {
          audioBuffer = fs.readFileSync(localPath);
        }
      }

      // If not found locally or external URL, fetch over HTTP
      if (!audioBuffer) {
        const res = await fetch(audioUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch audio from ${audioUrl}: HTTP ${res.status}`);
        }
        const arrayBuf = await res.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json(
        { error: 'No valid audio buffer or URL provided for transcription.' },
        { status: 400 }
      );
    }

    const result = await transcribeAudio(audioBuffer, mimeType);
    return NextResponse.json({
      transcript: result.transcript,
      modelUsed: result.modelUsed,
      diarizedSegments: result.diarizedSegments || [],
    });
  } catch (error: any) {
    console.error('[transcribe-api] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Audio transcription failed.' },
      { status: 500 }
    );
  }
}
