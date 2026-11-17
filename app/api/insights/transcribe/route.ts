import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { transcribeAudio } from '@/lib/audio-generator';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB cap
const ALLOWED_GCS_PREFIX =
  'https://storage.googleapis.com/ai-research-pulse-assets/insights/';

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
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
    return true;
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
      return true;
    }
  }
  return false;
}

async function readBoundedBuffer(res: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Audio payload exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`);
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Audio payload exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`);
    }
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Audio payload exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit`);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks, total);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audioUrl, base64Audio, mimeType = 'audio/wav' } = body;

    let audioBuffer: Buffer | null = null;

    if (base64Audio && typeof base64Audio === 'string') {
      const estimatedBytes = Math.floor((base64Audio.length * 3) / 4);
      if (estimatedBytes > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: 'Base64 audio payload exceeds 20MB limit.' },
          { status: 413 }
        );
      }
      audioBuffer = Buffer.from(base64Audio, 'base64');
    } else if (audioUrl && typeof audioUrl === 'string') {
      const trimmedUrl = audioUrl.trim();

      if (trimmedUrl.startsWith('/')) {
        // Strictly confine local audio reads to public/insights/ (prevents path traversal)
        const insightsRoot = path.resolve(process.cwd(), 'public', 'insights');
        const publicRoot = path.resolve(process.cwd(), 'public');
        const relativePath = trimmedUrl.replace(/^\/+/, '');
        const resolvedLocal = path.resolve(publicRoot, relativePath);

        if (!resolvedLocal.startsWith(insightsRoot + path.sep)) {
          return NextResponse.json(
            { error: 'Invalid local audio path: only /insights/* assets are permitted.' },
            { status: 400 }
          );
        }

        if (fs.existsSync(resolvedLocal) && fs.statSync(resolvedLocal).isFile()) {
          const stat = fs.statSync(resolvedLocal);
          if (stat.size > MAX_AUDIO_BYTES) {
            return NextResponse.json(
              { error: 'Audio asset exceeds 20MB limit.' },
              { status: 413 }
            );
          }
          audioBuffer = fs.readFileSync(resolvedLocal);
        } else {
          // Safe GCS archive fallback for /insights/* paths not stored locally
          const insightSubpath = path
            .relative(insightsRoot, resolvedLocal)
            .split(path.sep)
            .join('/');
          const gcsUrl = `${ALLOWED_GCS_PREFIX}${insightSubpath}`;
          const res = await fetch(gcsUrl, {
            signal: AbortSignal.timeout(15_000),
            redirect: 'error',
          });
          if (!res.ok) {
            throw new Error(`Failed to fetch audio from GCS archive: HTTP ${res.status}`);
          }
          audioBuffer = await readBoundedBuffer(res, MAX_AUDIO_BYTES);
        }
      } else {
        // Validate remote URL against SSRF rules (public https/http only, no private/metadata hosts)
        let parsed: URL;
        try {
          parsed = new URL(trimmedUrl);
        } catch {
          return NextResponse.json({ error: 'Invalid audioUrl.' }, { status: 400 });
        }

        if (
          (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
          isBlockedHost(parsed.hostname)
        ) {
          return NextResponse.json(
            { error: 'Blocked audioUrl: must be a public http(s) URL.' },
            { status: 400 }
          );
        }

        const res = await fetch(parsed.toString(), {
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch audio from ${parsed.origin}: HTTP ${res.status}`);
        }
        audioBuffer = await readBoundedBuffer(res, MAX_AUDIO_BYTES);
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
