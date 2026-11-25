import { GoogleAuth } from 'google-auth-library';
import { GoogleGenAI } from '@google/genai';

const rawProject =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  'sa-learning-1';
export const project =
  rawProject === 'sa-nexus-gcp-4-sandbox-183936' ? 'sa-learning-1' : rawProject;
export const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';

export type ModelTier = 'hydrogen' | 'neon' | 'carbon';
export type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

function uniqueModels(models: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const trimmed = m?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

const hydrogenModel = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
const neonModel =
  process.env.GEMINI_NEON_MODEL ||
  process.env.GEMINI_PRO_MODEL ||
  'gemini-4-neon';
const carbonModel = process.env.GEMINI_CARBON_MODEL || 'gemini-4-carbon';
const ttsModel = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
const ttsLiteModel =
  process.env.GEMINI_TTS_LITE_MODEL || 'gemini-3.8-flash-lite-tts';
const transcriptionModel =
  process.env.GEMINI_TRANSCRIPTION_MODEL || hydrogenModel;
const embeddingModel =
  process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
const rerankerModel =
  process.env.VERTEX_RERANKER_MODEL || 'semantic-ranker-512@latest';

/**
 * Verified Model Registry (sa-learning-1, global endpoint).
 *
 * - PRIMARY / HYDROGEN: `gemini-4-hydrogen` (GA) — light cognition: fast filtering,
 *   tagging, short summaries, overview briefings, and multimodal audio transcription.
 * - NEON: `gemini-4-neon` (GA) — cognitive-heavy frontier reasoning: interactive
 *   paper/article Q&A, A2UI 1.0 visual brief synthesis, cross-lab trends,
 *   multi-speaker podcast scripting, and recursive self-improvement audits.
 * - CARBON: `gemini-4-carbon` (GA) — secondary deep-reasoning fallback behind Neon.
 * - TTS: `gemini-3.8-flash-tts` (GA) — flagship studio multi-speaker TTS.
 * - TTS_LITE: `gemini-3.8-flash-lite-tts` (GA) — fast, cost-efficient single-speaker TTS.
 * - TRANSCRIPTION: `gemini-4-hydrogen` (GA) — multimodal speech-to-text + diarization.
 * - EMBEDDING: `text-embedding-004` (768-dim) — preserved for vector compatibility
 *   across existing Cloud SQL / SQLite rows (scheduled migration to gemini-embedding-001
 *   before April 1, 2027 retirement).
 * - RERANKER: `semantic-ranker-512@latest` via Discovery Engine Ranking API.
 */
export const MODEL_REGISTRY = {
  PRIMARY: hydrogenModel,
  HYDROGEN: hydrogenModel,
  NEON: neonModel,
  CARBON: carbonModel,
  FALLBACKS: uniqueModels([
    hydrogenModel,
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
  ]),
  NEON_FALLBACKS: uniqueModels([
    neonModel,
    'gemini-4-neon',
    carbonModel,
    'gemini-4-carbon',
    hydrogenModel,
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
  ]),
  CARBON_FALLBACKS: uniqueModels([
    neonModel,
    'gemini-4-neon',
    carbonModel,
    'gemini-4-carbon',
    hydrogenModel,
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
  ]),
  TTS: ttsModel,
  TTS_LITE: ttsLiteModel,
  TTS_MODELS: uniqueModels([
    ttsModel,
    'gemini-3.8-flash-tts',
    ttsLiteModel,
    'gemini-3.8-flash-lite-tts',
  ]),
  TTS_OVERVIEW_MODELS: uniqueModels([
    ttsLiteModel,
    'gemini-3.8-flash-lite-tts',
    ttsModel,
    'gemini-3.8-flash-tts',
  ]),
  TRANSCRIPTION: transcriptionModel,
  TRANSCRIPTION_MODELS: uniqueModels([
    transcriptionModel,
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
  ]),
  EMBEDDING: embeddingModel,
  RERANKER: rerankerModel,
} as const;

export interface AITelemetry {
  primaryModel: string;
  neonModel: string;
  carbonModel: string;
  ttsModel: string;
  ttsLiteModel: string;
  transcriptionModel: string;
  embeddingModel: string;
  rerankerModel: string;
  activeModel: string;
  totalCalls: number;
  fallbackCount: number;
  authStatus: 'ok' | 'reauth_needed' | 'api_key';
  lastError?: string;
  avgLatencyMs: number;
}

const telemetry: AITelemetry = {
  primaryModel: MODEL_REGISTRY.PRIMARY,
  neonModel: MODEL_REGISTRY.NEON,
  carbonModel: MODEL_REGISTRY.CARBON,
  ttsModel: MODEL_REGISTRY.TTS,
  ttsLiteModel: MODEL_REGISTRY.TTS_LITE,
  transcriptionModel: MODEL_REGISTRY.TRANSCRIPTION,
  embeddingModel: MODEL_REGISTRY.EMBEDDING,
  rerankerModel: MODEL_REGISTRY.RERANKER,
  activeModel: MODEL_REGISTRY.PRIMARY,
  totalCalls: 0,
  fallbackCount: 0,
  authStatus:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'api_key' : 'ok',
  avgLatencyMs: 0,
};

export function getAITelemetry(): AITelemetry {
  return { ...telemetry };
}

// Module-level GoogleAuth singleton for REST calls (embeddings, reranker, TTS v1beta1)
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
 * Builds the canonical Vertex AI publisher model REST endpoint.
 * Gemini 4 and Gemini 3.8 TTS models require the `global` endpoint (`aiplatform.googleapis.com`).
 */
export function getVertexEndpoint(
  model: string,
  action: 'generateContent' | 'predict' = 'generateContent',
  apiVersion: 'v1' | 'v1beta1' = 'v1beta1',
  overrideLocation?: string
): string {
  const targetProject =
    project === 'sa-nexus-gcp-4-sandbox-183936' ? 'sa-learning-1' : project;
  const effectiveLocation = overrideLocation || location || 'global';
  const host =
    effectiveLocation === 'global'
      ? 'aiplatform.googleapis.com'
      : `${effectiveLocation}-aiplatform.googleapis.com`;
  return `https://${host}/${apiVersion}/projects/${targetProject}/locations/${effectiveLocation}/publishers/google/models/${model}:${action}`;
}

/**
 * Returns a valid Bearer token using the module-level auth singleton,
 * falling back to `gcloud auth print-access-token` if local ADC requires reauth.
 */
export async function getAccessToken(): Promise<string> {
  if (process.env.CLOUDSDK_AUTH_ACCESS_TOKEN?.trim()) {
    telemetry.authStatus = 'ok';
    return process.env.CLOUDSDK_AUTH_ACCESS_TOKEN.trim();
  }

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

/**
 * Normalizes GenerateContent config to satisfy Gemini 4 / Gemini 3.8 API invariants:
 * - Gemini 4 counts thinking tokens inside `maxOutputTokens` (Hydrogen defaults to HIGH,
 *   Carbon defaults to MEDIUM). We default Hydrogen to `LOW` thinking for fast structured
 *   outputs and ensure `maxOutputTokens` is high enough (>= 4096 Hydrogen / >= 8192 Carbon)
 *   so thinking tokens never starve final output.
 * - Gemini 4 & 3.8 Flash reject `thinkingLevel: "MINIMAL"` and `thinkingBudget` with HTTP 400.
 * - Gemini 4 Carbon supports `LOW | MEDIUM | HIGH` (clamps `XHIGH` -> `HIGH`).
 * - Gemini 4 ignores `temperature`, `topP`, and `topK`; stripping them keeps requests clean.
 */
function normalizeConfigForModel(
  model: string,
  rawConfig?: any,
  thinkingLevel?: ThinkingLevel
): any {
  const cfg: any = rawConfig ? { ...rawConfig } : {};
  const isGemini4 = model.startsWith('gemini-4-');
  const isNeon = model.startsWith('gemini-4-neon');
  const isCarbon = model.startsWith('gemini-4-carbon');
  const isHeavy = isNeon || isCarbon;
  const isGemini38 = model.startsWith('gemini-3.8-');

  if (isGemini4) {
    delete cfg.temperature;
    delete cfg.topP;
    delete cfg.topK;

    const existingThinking = cfg.thinkingConfig ? { ...cfg.thinkingConfig } : {};
    delete existingThinking.thinkingBudget;

    let resolvedLevel: string =
      thinkingLevel ||
      existingThinking.thinkingLevel ||
      (isHeavy ? 'MEDIUM' : 'LOW');

    if (resolvedLevel === 'MINIMAL') resolvedLevel = 'LOW';
    if (isCarbon && resolvedLevel === 'XHIGH') resolvedLevel = 'HIGH';

    cfg.thinkingConfig = {
      ...existingThinking,
      thinkingLevel: resolvedLevel,
    };

    const minOutputTokens = isHeavy ? 8192 : 4096;
    if (
      typeof cfg.maxOutputTokens === 'number' &&
      cfg.maxOutputTokens < minOutputTokens
    ) {
      cfg.maxOutputTokens = minOutputTokens;
    }
  } else if (isGemini38) {
    if (cfg.thinkingConfig) {
      const tc = { ...cfg.thinkingConfig };
      if (tc.thinkingLevel === 'MINIMAL') tc.thinkingLevel = 'LOW';
      if (tc.thinkingLevel === 'XHIGH') tc.thinkingLevel = 'HIGH';
      cfg.thinkingConfig = tc;
    } else if (thinkingLevel) {
      cfg.thinkingConfig = {
        thinkingLevel: thinkingLevel === 'XHIGH' ? 'HIGH' : thinkingLevel,
      };
    }
  }

  return cfg;
}

async function generateViaRestApi(
  model: string,
  contents: any,
  config?: any
): Promise<string | null> {
  const token = await getAccessToken();
  const endpoint = getVertexEndpoint(model, 'generateContent', 'v1beta1');

  const formattedContents =
    typeof contents === 'string'
      ? [{ role: 'user', parts: [{ text: contents }] }]
      : Array.isArray(contents)
      ? contents
      : [contents];

  const body: any = { contents: formattedContents };
  if (config) {
    const genCfg: any = {};
    if (config.temperature !== undefined) genCfg.temperature = config.temperature;
    if (config.topP !== undefined) genCfg.topP = config.topP;
    if (config.topK !== undefined) genCfg.topK = config.topK;
    if (config.maxOutputTokens !== undefined) {
      genCfg.maxOutputTokens = config.maxOutputTokens;
    }
    if (config.responseMimeType) {
      genCfg.responseMimeType = config.responseMimeType;
    }
    if (config.responseSchema) {
      genCfg.responseSchema = config.responseSchema;
    }
    if (config.thinkingConfig) {
      genCfg.thinkingConfig = config.thinkingConfig;
    }
    if (Object.keys(genCfg).length > 0) {
      body.generationConfig = genCfg;
    }
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
    throw new Error(`REST API ${res.status}: ${errText.slice(0, 160)}`);
  }

  const data = await res.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => typeof p?.text === 'string' && !p?.thought)
    .map((p) => p.text)
    .join('');
  return text || null;
}

/**
 * Resilient content generation with dual-tier Gemini 4 routing:
 * - `tier: 'hydrogen'` (default, light cognition): `gemini-4-hydrogen` -> `gemini-3.8-flash` -> `gemini-3.5-flash`
 * - `tier: 'neon'` (heavy cognition): `gemini-4-neon` -> `gemini-4-carbon` -> `gemini-4-hydrogen` -> `gemini-3.8-flash`
 * - `tier: 'carbon'` (legacy alias, routes via Neon first): `gemini-4-neon` -> `gemini-4-carbon` -> `gemini-4-hydrogen`
 * Automatically applies Gemini 4 thinking/token safeguards and cascades on error.
 */
export async function generateContentWithFallback(options: {
  contents: any;
  config?: any;
  preferredModel?: string;
  tier?: ModelTier;
  thinkingLevel?: ThinkingLevel;
}): Promise<{ text: string; modelUsed: string }> {
  const start = Date.now();
  telemetry.totalCalls++;

  const baseChain =
    options.tier === 'neon' ||
    options.tier === 'carbon' ||
    options.preferredModel === MODEL_REGISTRY.NEON ||
    options.preferredModel === MODEL_REGISTRY.CARBON
      ? MODEL_REGISTRY.NEON_FALLBACKS
      : MODEL_REGISTRY.FALLBACKS;

  const modelsToTry = options.preferredModel
    ? uniqueModels([options.preferredModel, ...baseChain])
    : [...baseChain];

  const ai = getGenAIClient();
  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const effectiveConfig = normalizeConfigForModel(
      model,
      options.config,
      options.thinkingLevel
    );

    try {
      const text = process.env.CLOUDSDK_AUTH_ACCESS_TOKEN?.trim()
        ? await generateViaRestApi(model, options.contents, effectiveConfig)
        : (
            await ai.models.generateContent({
              model,
              contents: options.contents,
              config: effectiveConfig,
            })
          ).text;

      if (text) {
        const elapsed = Date.now() - start;
        telemetry.avgLatencyMs = Math.round(
          (telemetry.avgLatencyMs * (telemetry.totalCalls - 1) + elapsed) /
            telemetry.totalCalls
        );
        telemetry.activeModel = model;
        telemetry.authStatus =
          process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
            ? 'api_key'
            : 'ok';
        if (i > 0) telemetry.fallbackCount++;
        return { text, modelUsed: model };
      }

      lastError = new Error(`Model ${model} returned empty text response`);
      console.warn(
        `[vertex] Model ${model} returned empty text, trying fallback...`
      );
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);
      telemetry.lastError = errMsg.slice(0, 160);

      // If SDK failed due to ADC reauth (invalid_rapt), try v1beta1 REST API via gcloud CLI token
      if (errMsg.includes('invalid_rapt') || errMsg.includes('invalid_grant')) {
        try {
          const restText = await generateViaRestApi(
            model,
            options.contents,
            effectiveConfig
          );
          if (restText) {
            const elapsed = Date.now() - start;
            telemetry.avgLatencyMs = Math.round(
              (telemetry.avgLatencyMs * (telemetry.totalCalls - 1) + elapsed) /
                telemetry.totalCalls
            );
            telemetry.activeModel = model;
            telemetry.authStatus = 'ok';
            if (i > 0) telemetry.fallbackCount++;
            return { text: restText, modelUsed: model };
          }
        } catch (restErr: any) {
          lastError = restErr;
          telemetry.lastError = String(restErr?.message || restErr).slice(0, 160);
        }
      }

      console.warn(
        `[vertex] Model ${model} failed (${errMsg.slice(0, 100)}), trying fallback...`
      );
    }
  }

  throw lastError || new Error('All Gemini models failed to generate content');
}

/**
 * Generates embeddings in batches (up to 100 per API call) using Vertex AI text-embedding-004.
 * Preserves 768-dim vector search compatibility across existing Cloud SQL and SQLite rows.
 */
export async function getEmbeddingsBatch(
  texts: string[],
  timeoutMs = 8000
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!project) {
    console.warn('[vertex] GOOGLE_CLOUD_PROJECT not set — skipping embeddings');
    return texts.map(() => null);
  }

  const BATCH_SIZE = 20; // Keep total tokens per batch safely under text-embedding-004's 20k-token request cap
  const results: (number[] | null)[] = [];

  try {
    const token = await getAccessToken();
    const endpoint = getVertexEndpoint(MODEL_REGISTRY.EMBEDDING, 'predict', 'v1');

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          instances: chunk.map((t) => ({ content: t.slice(0, 6000) })),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Vertex AI batch embedding failed: ${response.status} ${response.statusText}`
        );
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
    console.warn(
      '[vertex] Batch embedding fallback (auth/network):',
      errMsg.slice(0, 120)
    );
    return texts.map(() => null);
  }
}

// Lightweight in-memory LRU cache for search query embeddings (eliminates repeat RPC latency)
const queryEmbeddingCache = new Map<string, { vec: number[]; ts: number }>();
const EMBEDDING_CACHE_MAX = 250;
const EMBEDDING_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Single text embedding helper with fast LRU cache & tight search timeout.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  const key = text.trim().toLowerCase();
  if (!key) return null;

  const cached = queryEmbeddingCache.get(key);
  if (cached && Date.now() - cached.ts < EMBEDDING_CACHE_TTL_MS) {
    // Refresh LRU order
    queryEmbeddingCache.delete(key);
    queryEmbeddingCache.set(key, cached);
    return cached.vec;
  }

  const [res] = await getEmbeddingsBatch([text], 2500);
  if (res) {
    if (queryEmbeddingCache.size >= EMBEDDING_CACHE_MAX) {
      const oldestKey = queryEmbeddingCache.keys().next().value;
      if (oldestKey) queryEmbeddingCache.delete(oldestKey);
    }
    queryEmbeddingCache.set(key, { vec: res, ts: Date.now() });
  }
  return res ?? null;
}
