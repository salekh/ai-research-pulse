import { GoogleGenAI } from "@google/genai";
import { Article } from './db';

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
});

export type InsightType = 'overview' | 'podcast';

export async function generateTranscript(articles: Article[], type: InsightType): Promise<string> {
  const modelName = "gemini-2.5-flash";
  let prompt = "";
  
  const articlesText = articles.map(a => `Title: ${a.title}\nSource: ${a.source}\nSnippet: ${a.snippet}\n`).join('\n---\n');

  if (type === 'podcast') {
    prompt = `
      Generate a podcast transcript between two hosts, Dr. Anya and Liam, discussing the following AI research articles.
      Make it engaging, conversational, and accessible but technically accurate.
      Dr. Anya is a senior researcher, knowledgeable and precise.
      Liam is a curious tech journalist, asking good questions and making connections.
      Keep it under 5 minutes of speaking time (approx 750 words).
      
      Format the output EXACTLY as:
      Dr. Anya: [text]
      Liam: [text]
      ...

      Articles:
      ${articlesText}
    `;
  } else {
    prompt = `
      Generate a concise audio overview transcript for a single speaker summarizing the following AI research articles.
      The speaker should be professional, clear, and engaging.
      Start with "Here is your AI Research Pulse update."
      Keep it under 3 minutes of speaking time (approx 450 words).
      
      Articles:
      ${articlesText}
    `;
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });

  const transcript = response.text;
  if (!transcript) throw new Error("Failed to generate transcript");
  
  return transcript;
}

export async function synthesizeAudio(transcript: string, type: InsightType): Promise<Buffer> {
  const ttsModel = "gemini-2.5-flash-preview-tts";
  
  let speechConfig: any = {};

  if (type === 'podcast') {
     speechConfig = {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
              {
                  speaker: "Dr. Anya",
                  voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: "Kore" }
                  }
              },
              {
                  speaker: "Liam",
                  voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: "Puck" }
                  }
              }
          ]
        }
     };
  } else {
     speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
              voiceName: "Kore"
          }
        }
     };
  }

  const prompt = `
### DIRECTOR'S NOTES
Accent: British English (Received Pronunciation)
Style: ${type === 'podcast' ? 'Engaging, conversational, and natural.' : 'Professional, clear, and informative.'}
Pacing: ${type === 'podcast' ? 'Natural conversation speed with slight variations.' : 'Steady and articulate.'}

#### TRANSCRIPT
${transcript}
  `;

  const audioResponse = await ai.models.generateContent({
      model: ttsModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      config: {
          responseModalities: ['AUDIO'],
          speechConfig: speechConfig
      }
  });

  const audioData = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!audioData) {
      throw new Error("Failed to generate audio data");
  }

  const pcmData = Buffer.from(audioData, 'base64');
  return writeWavHeader(pcmData, 24000);
}

function writeWavHeader(samples: Buffer, sampleRate: number) {
  const buffer = Buffer.alloc(44 + samples.length);
  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length, 4);
  buffer.write('WAVE', 8);
  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels (1 for Mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(2, 32); // BlockAlign (NumChannels * BitsPerSample/8)
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length, 40);
  samples.copy(buffer, 44);
  return buffer;
}
