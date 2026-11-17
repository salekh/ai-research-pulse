import fs from 'fs';
import path from 'path';
import { Article } from './db';
import {
  generateContentWithFallback,
  getAccessToken,
  getVertexEndpoint,
  MODEL_REGISTRY,
} from './vertex';

export type InsightType = 'overview' | 'podcast';

const SPEAKER_STYLES = {
  'Dr. Anya':
    'Warm, authoritative, thoughtful senior AI researcher speaking neutral American English with clear enunciation.',
  Liam:
    'Energetic, curious, sharp tech journalist speaking neutral American English with engaging conversational pacing.',
} as const;

const OVERVIEW_STYLE =
  'Authoritative, clear, approachable senior research analyst delivering a steady morning briefing in neutral American English.';

// ---------------------------------------------------------------------------
// Transcript / Script generation
// - `podcast` (multi-article deep dialogue synthesis) -> gemini-4-carbon (MEDIUM thinking)
// - `overview` (fast single-speaker executive briefing) -> gemini-4-hydrogen (LOW thinking)
// ---------------------------------------------------------------------------
export async function generateTranscriptWithModel(
  articles: Article[],
  type: InsightType
): Promise<{ transcript: string; modelUsed: string }> {
  const articlesText = articles
    .map((a, i) => `[${i + 1}] "${a.title}" (${a.source})\n${a.snippet}`)
    .join('\n\n');

  const prompt =
    type === 'podcast'
      ? buildPodcastPrompt(articlesText, articles.length)
      : buildOverviewPrompt(articlesText, articles.length);

  try {
    const { text, modelUsed } = await generateContentWithFallback({
      contents: prompt,
      tier: type === 'podcast' ? 'carbon' : 'hydrogen',
      thinkingLevel: type === 'podcast' ? 'MEDIUM' : 'LOW',
      config: {
        maxOutputTokens: type === 'podcast' ? 8192 : 4096,
        systemInstruction:
          type === 'podcast'
            ? PODCAST_SYSTEM_INSTRUCTION
            : OVERVIEW_SYSTEM_INSTRUCTION,
      },
    });
    return { transcript: text, modelUsed };
  } catch {
    if (type === 'podcast') {
      return {
        transcript: `Liam: Welcome back to Research Pulse. Today we're examining ${articles.length} technical papers from the frontier AI labs, including ${articles
          .slice(0, 2)
          .map((a) => a.title)
          .join(' and ')}.\nDr. Anya: What stands out across this cohort is the convergence between post-training reasoning efficiency and rigorous evaluation harnesses. Rather than scaling parameter counts alone, labs are optimizing test-time compute and agentic reliability.\nLiam: Let's dive straight into the methodology behind ${
          articles[0]?.title || 'the lead paper'
        }. What makes this architecture distinct?\nDr. Anya: The core innovation lies in how the system structures intermediate verification steps, sharply reducing hallucination rates on multi-step scientific and software engineering benchmarks.`,
        modelUsed: 'deterministic-fallback',
      };
    }
    return {
      transcript: `Here is your Research Pulse executive briefing. Across the ${
        articles.length
      } selected research publications—led by work from ${Array.from(
        new Set(articles.map((a) => a.source))
      ).join(
        ', '
      )}—the dominant technical trajectory centers on agentic execution harnesses, test-time reasoning scaling, and domain-specific scientific benchmarks. Key highlights include ${articles
        .slice(0, 3)
        .map((a) => `"${a.title}" (${a.source})`)
        .join('; ')}. Collectively, these developments signal a shift from static pre-training scaling toward verifiable, tool-augmented inference.`,
      modelUsed: 'deterministic-fallback',
    };
  }
}

export async function generateTranscript(
  articles: Article[],
  type: InsightType
): Promise<string> {
  const { transcript } = await generateTranscriptWithModel(articles, type);
  return transcript;
}

// ---------------------------------------------------------------------------
// TTS synthesis via Gemini 3.8 TTS (Vertex AI v1beta1 REST)
// - `podcast` (multi-speaker studio dialogue): gemini-3.8-flash-tts -> gemini-3.8-flash-lite-tts
// - `overview` (fast single-speaker briefing): gemini-3.8-flash-lite-tts -> gemini-3.8-flash-tts
//
// Uses per-turn `speech_metadata` (speaker + style) per the Gemini 3.8 TTS schema
// (avoiding both verbatim Director's Notes recitation and @google/genai@1.17.0's
// client-side rejection of `multiSpeakerVoiceConfig` on Vertex AI).
// Unary 3.8 TTS responses already contain a complete RIFF/WAVE header — checked
// before prepending a WAV header to avoid double-wrapping corruption.
// ---------------------------------------------------------------------------
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/^\s*\*\*(COLD OPEN|DEEP DIVES|RAPID FIRE|SIGN-OFF|OPENING|THEMATIC SECTIONS|CLOSE)[^*]*\*\*.*$/gim, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parsePodcastTurns(
  transcript: string
): Array<{ speaker: 'Dr. Anya' | 'Liam'; text: string }> {
  const turns: Array<{ speaker: 'Dr. Anya' | 'Liam'; text: string }> = [];
  const lines = transcript.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^(?:\*{0,2})(Dr\.?\s*Anya|Liam)(?:\*{0,2})\s*:\s*(.+)$/i);
    if (match) {
      const speaker: 'Dr. Anya' | 'Liam' = /^liam$/i.test(match[1].trim())
        ? 'Liam'
        : 'Dr. Anya';
      const cleaned = stripMarkdownForSpeech(match[2]);
      if (!cleaned) continue;

      const prev = turns[turns.length - 1];
      if (prev && prev.speaker === speaker) {
        prev.text = `${prev.text} ${cleaned}`;
      } else {
        turns.push({ speaker, text: cleaned });
      }
    } else if (turns.length > 0 && !/^\*\*.*\*\*$/.test(line) && !/^#/.test(line)) {
      const cleaned = stripMarkdownForSpeech(line);
      if (cleaned) {
        turns[turns.length - 1].text = `${turns[turns.length - 1].text} ${cleaned}`;
      }
    }
  }

  if (turns.length === 0) {
    const fallbackText = stripMarkdownForSpeech(transcript);
    if (fallbackText) {
      turns.push({ speaker: 'Dr. Anya', text: fallbackText });
    }
  }

  return turns;
}

function isWavBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  );
}

export async function synthesizeAudio(
  transcript: string,
  type: InsightType
): Promise<{ buffer: Buffer; modelUsed: string }> {
  const ttsChain =
    type === 'podcast'
      ? MODEL_REGISTRY.TTS_MODELS
      : MODEL_REGISTRY.TTS_OVERVIEW_MODELS;

  const isPodcast = type === 'podcast';
  const turns = isPodcast ? parsePodcastTurns(transcript) : [];
  const overviewText = isPodcast ? '' : stripMarkdownForSpeech(transcript);
  const parts = isPodcast
    ? turns
        .filter((turn) => turn.text.trim().length > 0)
        .map((turn) => ({
          text: turn.text,
          speech_metadata: {
            speaker: turn.speaker,
            style: SPEAKER_STYLES[turn.speaker],
          },
        }))
    : overviewText
    ? [
        {
          text: overviewText,
          speech_metadata: {
            style: OVERVIEW_STYLE,
          },
        },
      ]
    : [];

  const speechConfig = isPodcast
    ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Dr. Anya',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            {
              speaker: 'Liam',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          ],
        },
      }
    : {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      };

  let lastError: any = null;

  if (parts.length > 0 && parts.some((p) => p.text.trim().length > 0)) {
    try {
      const token = await getAccessToken();

      for (const ttsModel of ttsChain) {
        try {
          const endpoint = getVertexEndpoint(
            ttsModel,
            'generateContent',
            'v1beta1',
            'global'
          );

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig,
              },
            }),
            signal: AbortSignal.timeout(45_000),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`TTS HTTP ${res.status}: ${errText.slice(0, 160)}`);
          }

          const data = await res.json();
          const audioData =
            data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

          if (audioData) {
            const rawBuffer = Buffer.from(audioData, 'base64');
            const wavBuffer = isWavBuffer(rawBuffer)
              ? rawBuffer
              : writeWavHeader(rawBuffer, 24000);
            return {
              buffer: wavBuffer,
              modelUsed: ttsModel,
            };
          }
        } catch (err: any) {
          lastError = err;
          console.warn(
            `[audio-generator] TTS model ${ttsModel} failed (${String(err?.message || err).slice(0, 100)}), trying next fallback...`
          );
        }
      }
    } catch (authErr: any) {
      lastError = authErr;
      console.warn(
        `[audio-generator] Auth error before TTS synthesis: ${String(authErr?.message || authErr).slice(0, 100)}`
      );
    }
  } else {
    lastError = new Error('Empty transcript provided for TTS synthesis');
    console.warn('[audio-generator] Empty transcript — skipping Vertex TTS and using fallback.');
  }

  // Fallback to pre-rendered high-definition WAV file if Vertex AI TTS is offline or requires reauth
  try {
    const fallbackFile =
      type === 'podcast'
        ? path.join(process.cwd(), 'public', 'insights', 'current-week', 'podcast.wav')
        : path.join(process.cwd(), 'public', 'insights', 'current-week', 'overview.wav');
    if (fs.existsSync(fallbackFile)) {
      console.warn(
        `[audio-generator] Serving bundled WAV fallback (${path.basename(fallbackFile)}) after TTS error.`
      );
      return {
        buffer: fs.readFileSync(fallbackFile),
        modelUsed: 'bundled-wav-fallback',
      };
    }
  } catch {}

  throw lastError || new Error('All Gemini TTS models failed to generate audio data');
}

// ---------------------------------------------------------------------------
// Multimodal Speech-to-Text Audio Transcription via Gemini 4 Hydrogen
// Supports speaker diarization, timestamps, and technical ML terminology
// ---------------------------------------------------------------------------
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType = 'audio/wav'
): Promise<{
  transcript: string;
  modelUsed: string;
  diarizedSegments?: Array<{ speaker: string; timestamp: string; text: string }>;
}> {
  const base64Audio = audioBuffer.toString('base64');

  const prompt = `You are an expert AI research transcription and speaker diarization model.
Transcribe the provided audio accurately, paying special attention to machine learning terminology (e.g., RLHF, LoRA, MMLU, FlashAttention, mechanistic interpretability, test-time compute, Gemini, Claude, GPT).

Return a JSON object with this exact schema:
{
  "transcript": "Full formatted transcript where each speaker turn starts on a new line prefixed by Speaker Name (e.g. 'Dr. Anya: ...' or 'Speaker 1: ...')",
  "diarizedSegments": [
    {
      "speaker": "Dr. Anya",
      "timestamp": "00:00",
      "text": "Exact spoken words..."
    }
  ]
}`;

  try {
    const { text, modelUsed } = await generateContentWithFallback({
      preferredModel: MODEL_REGISTRY.TRANSCRIPTION,
      tier: 'hydrogen',
      thinkingLevel: 'LOW',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(text);
    return {
      transcript: parsed.transcript || text,
      modelUsed,
      diarizedSegments: parsed.diarizedSegments || [],
    };
  } catch (err: any) {
    console.warn(
      `[audio-generator] Transcription failed (${String(err?.message || err).slice(0, 100)}), using cached/deterministic fallback...`
    );
  }

  // Deterministic fallback transcript if offline/ADC reauth required
  try {
    const fallbackJsonPath = path.join(
      process.cwd(),
      'public',
      'insights',
      'current-week',
      'overview-transcript.json'
    );
    if (fs.existsSync(fallbackJsonPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackJsonPath, 'utf8'));
      return {
        transcript: data.transcript,
        modelUsed: `${MODEL_REGISTRY.TRANSCRIPTION} (cached-diarization)`,
      };
    }
  } catch {}

  return {
    transcript:
      'Dr. Anya: Welcome to Research Pulse. Today we examine frontier developments in test-time compute, multimodal world models, and verifiable agentic execution harnesses.',
    modelUsed: `${MODEL_REGISTRY.TRANSCRIPTION} (fallback)`,
  };
}

const PODCAST_SYSTEM_INSTRUCTION = `You are a world-class podcast script writer for "Research Pulse," a show that makes cutting-edge AI research accessible and exciting. You write scripts for two hosts:

• **Dr. Anya** — A senior AI researcher. She explains technical concepts with clarity and precision, uses analogies to make complex ideas intuitive, and occasionally shares "insider" perspectives on why a result matters to the field. Voice: warm, authoritative, thoughtful.

• **Liam** — A sharp tech journalist. He asks the questions the audience is thinking, draws connections between different papers, challenges assumptions constructively, and brings infectious curiosity. Voice: energetic, witty, occasionally irreverent.

Rules:
- Every spoken line must be prefixed with exactly "Dr. Anya:" or "Liam:" (no other speakers, no section header lines)
- Never use square-bracket stage directions like [laughs] or [pauses] — only plain spoken dialogue (optional angle-bracket tags like <short pause> are allowed sparingly)
- Target 700-800 words total (approx 5 minutes of audio)
- Use contractions and natural speech patterns — this is spoken audio, not an essay
- Technical terms must be accurate but immediately followed by a brief accessible explanation`;

const OVERVIEW_SYSTEM_INSTRUCTION = `You are a senior research analyst for "Research Pulse," delivering a polished audio briefing on the latest AI breakthroughs. Your audience is technical professionals who want a dense, high-signal summary they can listen to during their commute.

Rules:
- Write for a single speaker in a professional but engaging tone
- Output clean spoken prose only — no markdown headers, bullet symbols, or stage directions
- Target 400-500 words (approx 3 minutes)
- Use smooth transitions between topics — never just list articles
- Technical accuracy is paramount — do not oversimplify
- End with a forward-looking statement about what these developments mean collectively`;

function buildPodcastPrompt(articlesText: string, articleCount: number): string {
  return `Write a Research Pulse podcast episode covering the ${articleCount} articles below. Structure the script flow through these segments (do NOT print segment titles in the output, only "Liam:" and "Dr. Anya:" dialogue turns):

1. Cold Open (30 seconds): Liam opens with an attention-grabbing hook teasing the most surprising finding. Dr. Anya previews why this week matters.
2. Deep Dives (3 minutes): Group related articles into 2-3 thematic clusters. Liam introduces each theme with a sharp question; Dr. Anya explains the core technical contributions and analogies; both discuss field-wide implications.
3. Rapid Fire (1 minute): Quick hits on remaining articles. Liam names the work; Dr. Anya gives a crisp one-sentence take.
4. Sign-Off (30 seconds): Dr. Anya picks her paper of the week and why. Liam wraps up and thanks listeners.

Articles:
${articlesText}`;
}

function buildOverviewPrompt(articlesText: string, articleCount: number): string {
  return `Write a Research Pulse audio briefing covering the ${articleCount} articles below as continuous spoken prose (no markdown headers or bullets):

1. Opening (1 sentence): Start with "Here is your Research Pulse update." Follow with a single sentence capturing the overarching theme.
2. Thematic Sections (main body): Group the articles into 2-3 themes, summarize the key findings across related papers, highlight the most significant technical contribution, and transition smoothly between themes.
3. Close (2-3 sentences): Synthesize what these developments collectively signal about where the field is heading and close with a concrete prediction or question.

Articles:
${articlesText}`;
}

function writeWavHeader(samples: Buffer, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length, 40);
  samples.copy(buffer, 44);
  return buffer;
}
