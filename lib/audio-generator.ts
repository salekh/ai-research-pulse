import { GoogleGenAI } from "@google/genai";
import { Article } from './db';

// ---------------------------------------------------------------------------
// Vertex AI client (ADC — works on Cloud Run and local gcloud auth)
// Lazily initialised to avoid crashing during Next.js static page generation
// in Docker (where env vars like GOOGLE_CLOUD_PROJECT aren't set).
// ---------------------------------------------------------------------------
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    if (!project) throw new Error('[audio-generator] GOOGLE_CLOUD_PROJECT is not set');
    _ai = new GoogleGenAI({ vertexai: true, project, location });
  }
  return _ai;
}

export type InsightType = 'overview' | 'podcast';

// ---------------------------------------------------------------------------
// Transcript generation — produces a script optimised for TTS
// ---------------------------------------------------------------------------
export async function generateTranscript(articles: Article[], type: InsightType): Promise<string> {
  const articlesText = articles
    .map((a, i) => `[${i + 1}] "${a.title}" (${a.source})\n${a.snippet}`)
    .join('\n\n');

  const prompt = type === 'podcast'
    ? buildPodcastPrompt(articlesText, articles.length)
    : buildOverviewPrompt(articlesText, articles.length);

  const response = await getAI().models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: {
      temperature: 0.7,   // Creative but structured
      topP: 0.95,
      maxOutputTokens: 4096,
      systemInstruction: type === 'podcast'
        ? PODCAST_SYSTEM_INSTRUCTION
        : OVERVIEW_SYSTEM_INSTRUCTION,
    },
  });

  const transcript = response.text;
  if (!transcript) throw new Error('Failed to generate transcript');
  return transcript;
}

// ---------------------------------------------------------------------------
// TTS synthesis — converts transcript to audio via Gemini TTS
// ---------------------------------------------------------------------------
export async function synthesizeAudio(transcript: string, type: InsightType): Promise<Buffer> {
  const speechConfig = type === 'podcast'
    ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speaker: 'Dr. Anya', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            { speaker: 'Liam', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          ],
        },
      }
    : {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      };

  const directorsNotes = type === 'podcast'
    ? PODCAST_DIRECTORS_NOTES
    : OVERVIEW_DIRECTORS_NOTES;

  const audioResponse = await getAI().models.generateContent({
    model: 'gemini-2.5-pro-preview-tts',
    contents: [{ role: 'user', parts: [{ text: `${directorsNotes}\n\n#### TRANSCRIPT\n${transcript}` }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig,
    },
  });

  const audioData = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) throw new Error('Failed to generate audio data');

  return writeWavHeader(Buffer.from(audioData, 'base64'), 24000);
}

// ---------------------------------------------------------------------------
// System instructions — set persona and constraints before the content prompt
// ---------------------------------------------------------------------------
const PODCAST_SYSTEM_INSTRUCTION = `You are a world-class podcast script writer for "Research Pulse," a show that makes cutting-edge AI research accessible and exciting. You write scripts for two hosts:

• **Dr. Anya** — A senior AI researcher. She explains technical concepts with clarity and precision, uses analogies to make complex ideas intuitive, and occasionally shares "insider" perspectives on why a result matters to the field. Voice: warm, authoritative, thoughtful.

• **Liam** — A sharp tech journalist. He asks the questions the audience is thinking, draws connections between different papers, challenges assumptions constructively, and brings infectious curiosity. Voice: energetic, witty, occasionally irreverent.

Rules:
- Every line must be prefixed with exactly "Dr. Anya:" or "Liam:" (no other speakers)
- Never use stage directions like [laughs], [pauses], etc. — the TTS handles delivery
- Target 700-800 words total (approx 5 minutes of audio)
- Use contractions and natural speech patterns — this is spoken audio, not an essay
- Technical terms must be accurate but immediately followed by a brief accessible explanation`;

const OVERVIEW_SYSTEM_INSTRUCTION = `You are a senior research analyst for "Research Pulse," delivering a polished audio briefing on the latest AI breakthroughs. Your audience is technical professionals who want a dense, high-signal summary they can listen to during their commute.

Rules:
- Write for a single speaker in a professional but engaging tone
- Target 400-500 words (approx 3 minutes)
- Use smooth transitions between topics — never just list articles
- Technical accuracy is paramount — do not oversimplify
- End with a forward-looking statement about what these developments mean collectively`;

// ---------------------------------------------------------------------------
// Content prompts
// ---------------------------------------------------------------------------
function buildPodcastPrompt(articlesText: string, articleCount: number): string {
  return `Write a Research Pulse podcast episode covering the ${articleCount} articles below. Structure the script in these segments:

**COLD OPEN** (30 seconds)
Liam opens with an attention-grabbing hook that teases the most surprising finding from the articles. Dr. Anya responds with a brief preview of why this week is particularly interesting.

**DEEP DIVES** (3 minutes)
Group related articles into 2-3 thematic clusters. For each cluster:
- Liam introduces the theme and asks a sharp question
- Dr. Anya explains the key technical contributions, using analogies where helpful
- They briefly discuss implications and connections to the broader field
- Liam transitions naturally to the next theme

**RAPID FIRE** (1 minute)
Quick hits on any remaining articles not covered in the deep dives. Liam reads the headline, Dr. Anya gives a one-sentence take.

**SIGN-OFF** (30 seconds)
Dr. Anya shares her "paper of the week" pick and why. Liam wraps with a forward-looking comment and thanks the listeners.

Articles:
${articlesText}`;
}

function buildOverviewPrompt(articlesText: string, articleCount: number): string {
  return `Write a Research Pulse audio briefing covering the ${articleCount} articles below. Structure the briefing as:

**OPENING** (1 sentence)
Start with: "Here is your Research Pulse update." Follow with a single sentence that captures the overarching theme of this batch of research.

**THEMATIC SECTIONS** (main body)
Group the articles into 2-3 themes. For each theme:
- Name the theme clearly (e.g., "In language model efficiency...")
- Summarize the key findings across the related articles
- Highlight the most significant technical contribution
- Use smooth transitions between themes

**CLOSE** (2-3 sentences)
Synthesize what these developments collectively signal about where the field is heading. End with a concrete prediction or question for the listener to think about.

Articles:
${articlesText}`;
}

// ---------------------------------------------------------------------------
// TTS Director's Notes — guide vocal delivery, emotion, and pacing
// ---------------------------------------------------------------------------
const PODCAST_DIRECTORS_NOTES = `### DIRECTOR'S NOTES

**General Delivery:**
- Accent: Neutral American English with clear enunciation
- Tone: Two colleagues having a genuinely engaging conversation — not scripted or stiff
- Energy: Start medium, build enthusiasm during deep dives, mellow for sign-off

**Dr. Anya's Delivery:**
- Speak with quiet confidence and warmth
- Slow down slightly when explaining a key technical insight — let it land
- Use rising intonation when connecting ideas ("...and what's fascinating is...")

**Liam's Delivery:**
- More dynamic and animated than Dr. Anya
- Genuine curiosity in questions — not performative
- Slightly faster pace during rapid-fire segment
- Express authentic surprise or excitement when warranted`;

const OVERVIEW_DIRECTORS_NOTES = `### DIRECTOR'S NOTES

**Delivery:**
- Accent: Neutral American English, clear and professional
- Tone: Authoritative but approachable — like a trusted colleague giving a morning briefing
- Pacing: Steady and measured, with brief natural pauses between thematic sections
- Emphasis: Slightly stress key technical terms and lab names
- Energy: Calm and confident throughout, with a subtle uptick of energy in the closing statement`;

// ---------------------------------------------------------------------------
// WAV header writer — Gemini TTS returns raw 16-bit PCM at 24kHz
// ---------------------------------------------------------------------------
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
