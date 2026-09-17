import { Storage } from '@google-cloud/storage';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Article } from './db';

const BUCKET_NAME = process.env.GCS_ARCHIVE_BUCKET || 'ai-research-pulse-assets';
const MASTER_ARCHIVE_PATH = 'archive/articles-master.json';
const SQLITE_BACKUP_PATH = 'archive/news.db';

let storageClient: Storage | null = null;

function getStorage(): Storage | null {
  if (!storageClient) {
    try {
      storageClient = new Storage();
    } catch (e) {
      console.warn('[GCS-Archive] Failed to initialize Google Cloud Storage client:', e);
    }
  }
  return storageClient;
}

function getGcloudAccessToken(): string | null {
  try {
    return execSync('gcloud auth print-access-token', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function uploadViaRestApi(
  objectName: string,
  content: Buffer | string,
  contentType: string,
  token: string
): Promise<boolean> {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(
    objectName
  )}`;
  const bodyPayload: any =
    typeof content === 'string' ? content : new Uint8Array(content);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, max-age=0',
    },
    body: bodyPayload,
  });
  return res.ok;
}

/**
 * Backup all articles as a canonical JSON archive + SQLite file snapshot in GCS.
 * Cost: < $0.0002 / month on GCP Standard Storage with 11-nines durability.
 */
export async function backupArticlesToGCS(articles: Article[]): Promise<boolean> {
  if (articles.length === 0) return false;

  const payload = JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      totalCount: articles.length,
      articles,
    },
    null,
    2
  );

  // 1. Try standard @google-cloud/storage SDK (works in Cloud Run)
  const storage = getStorage();
  if (storage) {
    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(MASTER_ARCHIVE_PATH);
      await file.save(payload, {
        contentType: 'application/json',
        resumable: false,
        metadata: { cacheControl: 'no-cache, max-age=0' },
      });

      const localDbPath = path.join(process.cwd(), 'data', 'news.db');
      if (fs.existsSync(localDbPath)) {
        await bucket.upload(localDbPath, {
          destination: SQLITE_BACKUP_PATH,
          metadata: {
            contentType: 'application/x-sqlite3',
            cacheControl: 'no-cache, max-age=0',
          },
        });
      }

      console.log(
        `[GCS-Archive] Backed up ${articles.length} articles to gs://${BUCKET_NAME}/${MASTER_ARCHIVE_PATH}`
      );
      return true;
    } catch (err: any) {
      // Fall through to gcloud token fallback if ADC has invalid_rapt locally
    }
  }

  // 2. Fallback to gcloud CLI access token REST upload (works on Cloudtop without ADC reauth)
  const token = getGcloudAccessToken();
  if (token) {
    try {
      const okJson = await uploadViaRestApi(
        MASTER_ARCHIVE_PATH,
        payload,
        'application/json',
        token
      );
      const localDbPath = path.join(process.cwd(), 'data', 'news.db');
      if (fs.existsSync(localDbPath)) {
        const dbBuf = fs.readFileSync(localDbPath);
        await uploadViaRestApi(
          SQLITE_BACKUP_PATH,
          dbBuf,
          'application/x-sqlite3',
          token
        );
      }
      if (okJson) {
        console.log(
          `[GCS-Archive] Backed up ${articles.length} articles via REST token to gs://${BUCKET_NAME}/${MASTER_ARCHIVE_PATH}`
        );
        return true;
      }
    } catch (e: any) {
      console.warn('[GCS-Archive] REST upload fallback error:', e?.message || e);
    }
  }

  return false;
}

/**
 * Fetch the canonical master archive from GCS to hydrate empty/stale databases on startup.
 */
export async function restoreArticlesFromGCS(): Promise<Article[]> {
  try {
    // 1. Try public HTTPS fetch first (fast, zero-auth required)
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${MASTER_ARCHIVE_PATH}?t=${Date.now()}`;
    const res = await fetch(publicUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.articles) && data.articles.length > 0) {
        console.log(
          `[GCS-Archive] Loaded ${data.articles.length} articles from public GCS archive.`
        );
        return data.articles;
      }
    }
  } catch {}

  // 2. Try authenticated SDK download
  const storage = getStorage();
  if (storage) {
    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(MASTER_ARCHIVE_PATH);
      const [exists] = await file.exists();
      if (exists) {
        const [contents] = await file.download();
        const data = JSON.parse(contents.toString('utf-8'));
        if (Array.isArray(data.articles)) {
          return data.articles;
        }
      }
    } catch {}
  }

  // 3. Try authenticated REST download via gcloud token
  const token = getGcloudAccessToken();
  if (token) {
    try {
      const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o/${encodeURIComponent(
        MASTER_ARCHIVE_PATH
      )}?alt=media`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.articles)) {
          return data.articles;
        }
      }
    } catch {}
  }

  return [];
}
