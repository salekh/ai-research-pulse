import fs from 'fs';
import {
  saveArticles,
  getArticles,
  getDBStats,
  Article,
} from '../lib/db';
import { extractTagsDeterministic } from '../lib/ingestion';
import { getEmbeddingsBatch } from '../lib/vertex';
import { backupArticlesToGCS } from '../lib/gcs-archive';

async function main() {
  console.log('=== Starting Chinese Frontier (DeepSeek, Qwen, Kimi, GLM) Backfill ===');

  if (!fs.existsSync('/tmp/chinese-frontier-articles.json')) {
    throw new Error('Missing /tmp/chinese-frontier-articles.json');
  }

  const rawList: Array<{
    title: string;
    link: string;
    date: string;
    source: 'Chinese Frontier';
    snippet: string;
    subLab?: string;
  }> = JSON.parse(fs.readFileSync('/tmp/chinese-frontier-articles.json', 'utf8'));

  console.log(`Loaded ${rawList.length} Chinese Frontier publications.`);

  const articles: Article[] = rawList.map((item) => {
    const baseTags = extractTagsDeterministic(item.title, item.snippet);
    const subLab = item.subLab || 'Chinese Frontier';
    const tags = [subLab, ...baseTags.filter((t) => t !== subLab)];
    return {
      title: item.title,
      link: item.link,
      date: item.date,
      source: 'Chinese Frontier',
      snippet: item.snippet,
      tags,
    };
  });

  console.log('Saving articles to database...');
  await saveArticles(articles);

  // Fetch all articles with embeddings to find those missing embeddings
  const allDbArticles = await getArticles(5000, undefined, 0, undefined, true);
  const missingEmb = allDbArticles.filter((a) => !a.embedding || a.embedding.length === 0);
  console.log(`Found ${missingEmb.length} articles needing 768-dim embeddings.`);

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
  console.log('=== Backfill Complete ===');
  console.log('DB Stats:', JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
