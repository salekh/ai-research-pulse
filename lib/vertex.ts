import { GoogleAuth } from 'google-auth-library';

const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Module-level singleton — the google-auth-library caches tokens internally,
// but we also avoid re-allocating the client object on every call.
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

/**
 * Returns a valid Bearer token using the module-level auth singleton.
 * Token caching is handled internally by google-auth-library.
 */
async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  if (!token) throw new Error('Failed to obtain Google Cloud access token');
  return token;
}

/**
 * Generates a text embedding using Vertex AI text-embedding-004.
 * Returns null if the project is not configured or the call fails.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!project) {
    console.warn('[vertex] GOOGLE_CLOUD_PROJECT not set — skipping embedding');
    return null;
  }
  try {
    const token = await getAccessToken();
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-004:predict`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ content: text }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Vertex AI embedding API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.predictions[0].embeddings.values as number[];
  } catch (e) {
    console.error('[vertex] Error generating embedding:', e);
    return null;
  }
}

/**
 * Returns a valid Bearer token for use with other Vertex / Discovery Engine APIs
 * (e.g. the reranker). Exported so callers don't need to manage their own auth.
 */
export { getAccessToken, project, location };
