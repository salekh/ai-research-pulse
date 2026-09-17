import { GoogleAuth } from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';

export const project =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  'sa-nexus-gcp-4-sandbox-183936';
export const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';

export const MODEL_REGISTRY = {
  PRIMARY: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  FALLBACKS: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'],
  TTS: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
  TTS_MODELS: [
    'gemini-3.8-flash-tts',
    'gemini-3.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
    'gemini-2.5-flash-preview-tts',
  ],
  TRANSCRIPTION: process.env.GEMINI_TRANSCRIPTION_MODEL || 'gemini-3.8-flash',
  TRANSCRIPTION_MODELS: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'],
  EMBEDDING: 'text-embedding-004',
  RERANKER: 'semantic-ranker-512@latest',
} as const;

export interface AITelemetry {
  primaryModel: string;
  activeModel: string;
  totalCalls: number;
  fallbackCount: number;
  authStatus: 'ok' | 'reauth_needed' | 'api_key';
  lastError?: string;
  avgLatencyMs: number;
}

const telemetry: AITelemetry = {
  primaryModel: MODEL_REGISTRY.PRIMARY,
  activeModel: MODEL_REGISTRY.PRIMARY,
  totalCalls: 0,
  fallbackCount: 0,
  authStatus: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'api_key' : 'ok',
  avgLatencyMs: 0,
};

export function getAITelemetry(): AITelemetry {
  return { ...telemetry };
}

// Module-level GoogleAuth singleton for REST calls (embeddings, reranker)
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

let _aiClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI {
  if (!_aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      _aiClient = new GoogleGenAI({ apiKey });
      telemetry.authStatus = 'api_key';
    } else {
      _aiClient = new GoogleGenAI({ vertexai: true, project, location });
    }
  }
  return _aiClient;
}

/**
 * Returns a valid Bearer token using the module-level auth singleton,
 * falling back to `gcloud auth print-access-token` if local ADC requires reauth.
 */
export async function getAccessToken(): Promise<string> {
  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (tokenResponse.token) return tokenResponse.token;
  } catch {}

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process');
    const token = execSync('gcloud auth print-access-token', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (token) {
      telemetry.authStatus = 'ok';
      return token;
    }
  } catch {}

  throw new Error('Failed to obtain Google Cloud access token');
}

async function generateViaRestApi(
  model: string,
  contents: any,
  config?: any
): Promise<string | null> {
  const token = await getAccessToken();
  const targetProject = project === 'sa-nexus-gcp-4-sandbox-183936' ? 'sa-learning-1' : project;
  const endpoint =
    location === 'global'
      ? `https://aiplatform.googleapis.com/v1/projects/${targetProject}/locations/global/publishers/google/models/${model}:generateContent`
      : `https://${location}-aiplatform.googleapis.com/v1/projects/${targetProject}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const formattedContents =
    typeof contents === 'string'
      ? [{ role: 'user', parts: [{ text: contents }] }]
      : Array.isArray(contents)
      ? contents
      : [contents];

  const body: any = { contents: formattedContents };
  if (config) {
    body.generationConfig = {};
    if (config.temperature !== undefined) body.generationConfig.temperature = config.temperature;
    if (config.responseMimeType) body.generationConfig.responseMimeType = config.responseMimeType;
    if (config.systemInstruction) {
      body.systemInstruction =
        typeof config.systemInstruction === 'string'
          ? { parts: [{ text: config.systemInstruction }] }
          : config.systemInstruction;
    }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`REST API ${res.status}: ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/**
 * Resilient content generation that defaults to `gemini-3.8-flash` and automatically
 * cascades through fallbacks if an endpoint returns 404/400 or auth error.
 */
export async function generateContentWithFallback(options: {
  contents: any;
  config?: any;
  preferredModel?: string;
}): Promise<{ text: string; modelUsed: string }> {
  const start = Date.now();
  telemetry.totalCalls++;

  const modelsToTry = options.preferredModel
    ? [options.preferredModel, ...MODEL_REGISTRY.FALLBACKS.filter((m) => m !== options.preferredModel)]
    : [...MODEL_REGISTRY.FALLBACKS];

  const ai = getGenAIClient();
  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });

      const text = response.text;
      if (text) {
        const elapsed = Date.now() - start;
        telemetry.avgLatencyMs = Math.round(
          (telemetry.avgLatencyMs * (telemetry.totalCalls - 1) + elapsed) / telemetry.totalCalls
        );
        telemetry.activeModel = model;
        telemetry.authStatus = process.env.GEMINI_API_KEY ? 'api_key' : 'ok';
        if (i > 0) telemetry.fallbackCount++;
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);

      // If SDK failed due to ADC reauth (invalid_rapt), try REST API via gcloud CLI token
      if (errMsg.includes('invalid_rapt') || errMsg.includes('invalid_grant')) {
        try {
          const restText = await generateViaRestApi(model, options.contents, options.config);
          if (restText) {
            const elapsed = Date.now() - start;
            telemetry.avgLatencyMs = Math.round(
              (telemetry.avgLatencyMs * (telemetry.totalCalls - 1) + elapsed) / telemetry.totalCalls
            );
            telemetry.activeModel = model;
            telemetry.authStatus = 'ok';
            return { text: restText, modelUsed: model };
          }
        } catch (restErr: any) {
          lastError = restErr;
        }
      }

      console.warn(`[vertex] Model ${model} failed (${errMsg.slice(0, 80)}), trying fallback...`);
    }
  }

  throw lastError || new Error('All Gemini models failed to generate content');
}

/**
 * Generates embeddings in batches (up to 100 per API call) using Vertex AI text-embedding-004.
 * Replaces serial N+1 HTTP calls with single batched requests.
 */
export async function getEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!project) {
    console.warn('[vertex] GOOGLE_CLOUD_PROJECT not set — skipping embeddings');
    return texts.map(() => null);
  }

  const BATCH_SIZE = 100;
  const results: (number[] | null)[] = [];

  try {
    const token = await getAccessToken();
    const targetProject = project === 'sa-nexus-gcp-4-sandbox-183936' ? 'sa-learning-1' : project;
    const endpoint =
      location === 'global'
        ? `https://aiplatform.googleapis.com/v1/projects/${targetProject}/locations/global/publishers/google/models/${MODEL_REGISTRY.EMBEDDING}:predict`
        : `https://${location}-aiplatform.googleapis.com/v1/projects/${targetProject}/locations/${location}/publishers/google/models/${MODEL_REGISTRY.EMBEDDING}:predict`;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: chunk.map((t) => ({ content: t.slice(0, 6000) })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Vertex AI batch embedding failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const predictions = data.predictions || [];
      for (let j = 0; j < chunk.length; j++) {
        results.push((predictions[j]?.embeddings?.values as number[]) || null);
      }
    }
    return results;
  } catch (e: any) {
    const errMsg = String(e?.message || e);
    if (errMsg.includes('invalid_rapt') || errMsg.includes('invalid_grant')) {
      telemetry.authStatus = 'reauth_needed';
    }
    console.warn('[vertex] Batch embedding fallback (auth/network):', errMsg.slice(0, 120));
    return texts.map(() => null);
  }
}

/**
 * Single text embedding helper (delegates to batch).
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  const [res] = await getEmbeddingsBatch([text]);
  return res ?? null;
}
