import fs from 'fs';
import {
  saveArticles,
  getArticles,
  getDBStats,
  Article,
} from '../lib/db';
import { extractTagsDeterministic, fetchGoogleCloudBlogArchive } from '../lib/ingestion';
import { getEmbeddingsBatch } from '../lib/vertex';
import { backupArticlesToGCS } from '../lib/gcs-archive';

async function main() {
  console.log('=== Starting Google Cloud AI & ML Blog Historical Backfill (2025-2026) ===');

  let articles: Article[] = [];
  if (fs.existsSync('/tmp/gcloud-ai-articles.json')) {
    console.log('Loading cached 531 articles from /tmp/gcloud-ai-articles.json...');
    articles = JSON.parse(fs.readFileSync('/tmp/gcloud-ai-articles.json', 'utf8'));
  } else {
    console.log('Fetching live from Google Cloud Blog Boq RPC (SQC9mf)...');
    articles = await fetchGoogleCloudBlogArchive(2025);
  }

  console.log(`Loaded ${articles.length} Google Cloud AI articles from 2025-01-01 onwards.`);

  // Assign deterministic baseline tags immediately so no article is ever untagged
  for (const a of articles) {
    if (!a.tags || a.tags.length === 0) {
      a.tags = extractTagsDeterministic(a.title, a.snippet);
    }
  }

  console.log('Saving articles to database...');
  await saveArticles(articles);

  // Fetch all articles with embeddings to identify any missing embeddings
  const allDbArticles = await getArticles(5000, undefined, 0, undefined, true);
  const missingEmb = allDbArticles.filter((a) => !a.embedding || a.embedding.length === 0);
  console.log(`Found ${missingEmb.length} total articles needing 768-dim embeddings.`);

  const batchSize = 80;
  for (let i = 0; i < missingEmb.length; i += batchSize) {
    const batch = missingEmb.slice(i, i + batchSize);
    console.log(
      `Generating embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        missingEmb.length / batchSize
      )} (${batch.length} items)...`
    );
    const texts = batch.map((a) => `${a.title}. ${a.snippet}`);
    const embeddings = await getEmbeddingsBatch(texts);

    const updatedBatch: Article[] = [];
    for (let j = 0; j < batch.length; j++) {
      if (embeddings[j] && embeddings[j]!.length > 0) {
        batch[j].embedding = embeddings[j]!;
        updatedBatch.push(batch[j]);
      }
    }
    if (updatedBatch.length > 0) {
      await saveArticles(updatedBatch);
      console.log(`  Saved ${updatedBatch.length} embeddings.`);
    }
  }

  // Sync full master archive to Google Cloud Storage
  console.log('Backing up full master archive to GCS (gs://ai-research-pulse-assets)...');
  const finalAllArticles = await getArticles(5000, undefined, 0, undefined, true);
  await backupArticlesToGCS(finalAllArticles);

  const stats = await getDBStats();
  const gcloudCount = finalAllArticles.filter((a) => a.source === 'Google Cloud AI').length;
  const gcloud2026 = finalAllArticles.filter(
    (a) => a.source === 'Google Cloud AI' && a.date.startsWith('2026')
  ).length;
  const gcloud2025 = finalAllArticles.filter(
    (a) => a.source === 'Google Cloud AI' && a.date.startsWith('2025')
  ).length;

  console.log('=== Backfill Complete ===');
  console.log('DB Stats:', JSON.stringify(stats, null, 2));
  console.log(
    `Google Cloud AI Total: ${gcloudCount} (2026: ${gcloud2026}, 2025: ${gcloud2025})`
  );
}

main().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
