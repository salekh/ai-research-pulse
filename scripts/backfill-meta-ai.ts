import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import {
  saveArticles,
  getArticles,
  getDBStats,
  Article,
} from '../lib/db';
import {
  extractTagsDeterministic,
  fetchMetaResearchPortal,
} from '../lib/ingestion';
import { filterTechnicalArticles } from '../lib/content-filter';
import { getEmbeddingsBatch } from '../lib/vertex';
import { backupArticlesToGCS } from '../lib/gcs-archive';

const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml; q=0.1',
  },
});

const META_FEEDS = [
  'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_meta_ai.xml',
  'https://engineering.fb.com/category/ai-research/feed/',
  'https://engineering.fb.com/category/ml-applications/feed/',
];

async function enrichAiMetaBlogSnippet(article: Article): Promise<Article> {
  if (
    article.snippet &&
    article.snippet.length > article.title.length + 25 &&
    article.snippet.trim() !== article.title.trim()
  ) {
    return article;
  }

  try {
    const res = await fetch(article.link, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return article;
    const html = await res.text();
    const $ = cheerio.load(html);
    const metaDesc = (
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      ''
    )
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    $('script, style, nav, footer, header').remove();
    const paras: string[] = [];
    $('p, div').each((_, el) => {
      const txt = $(el)
        .text()
        .replace(/\u00a0/g, ' ')
        .replace(/^FEATURED\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (
        txt.length > 80 &&
        txt.length < 550 &&
        !txt.toLowerCase().includes('cookie') &&
        !txt.includes('Meta ©') &&
        !txt.includes('minute read')
      ) {
        paras.push(txt);
      }
    });

    const firstPara = paras[0] || '';
    const enrichedSnippet = (metaDesc || firstPara || article.snippet || article.title).slice(
      0,
      550
    );
    return {
      ...article,
      snippet: enrichedSnippet,
      tags: extractTagsDeterministic(article.title, enrichedSnippet),
    };
  } catch {
    return article;
  }
}

async function main() {
  console.log('=== Starting Meta AI Research (research.meta.ai + ai.meta.com + engineering.fb.com) Backfill ===');

  // 1. Crawl https://research.meta.ai/ (home + /blog + /sitemap.xml)
  const portalArticles = await fetchMetaResearchPortal();
  console.log(`Fetched ${portalArticles.length} flagship articles from https://research.meta.ai/`);
  for (const a of portalArticles) {
    console.log(`  [research.meta.ai] ${a.date.slice(0, 10)} | ${a.title} -> ${a.link}`);
  }

  // 2. Fetch Meta AI RSS feeds (2025+)
  const cutoff = new Date('2025-01-01T00:00:00Z').getTime();
  const rssArticles: Article[] = [];

  for (const feedUrl of META_FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = await parser.parseString(xml);
      for (const item of parsed.items) {
        const title = (item.title || '').replace(/\u00a0/g, ' ').trim();
        const link = (item.link || '').trim();
        if (!title || !link) continue;
        const pubTime = item.isoDate
          ? new Date(item.isoDate).getTime()
          : item.pubDate
          ? new Date(item.pubDate).getTime()
          : Date.now();
        if (pubTime < cutoff) continue;

        const snippet = (item.contentSnippet || item.content || '')
          .replace(/<[^>]*>?/gm, '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 550);

        rssArticles.push({
          title,
          link,
          date: new Date(pubTime).toISOString(),
          source: 'Meta AI',
          snippet: snippet || title,
          tags: extractTagsDeterministic(title, snippet || title),
        });
      }
    } catch (e) {
      console.warn(`Warning fetching ${feedUrl}:`, e);
    }
  }

  console.log(`Fetched ${rssArticles.length} RSS articles from 2025-01-01 onwards.`);

  // 3. Deduplicate (portal articles first so https://research.meta.ai/blog/... links win)
  const combined = [...portalArticles, ...rssArticles];
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped = combined.filter((a) => {
    const linkKey = a.link.split('?')[0].replace(/\/$/, '').toLowerCase();
    const titleKey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) return false;
    seenLinks.add(linkKey);
    seenTitles.add(titleKey);
    return true;
  });

  console.log(`Deduplicated to ${deduped.length} unique Meta AI candidates. Enriching snippets...`);

  // 4. Enrich snippets in batches of 10
  const enriched: Article[] = [];
  for (let i = 0; i < deduped.length; i += 10) {
    const chunk = deduped.slice(i, i + 10);
    const chunkRes = await Promise.all(chunk.map((a) => enrichAiMetaBlogSnippet(a)));
    enriched.push(...chunkRes);
  }

  // 5. Filter technical articles (preserving all research.meta.ai articles directly)
  const technical = await filterTechnicalArticles(enriched);
  console.log(`Kept ${technical.length} technical Meta AI articles. Saving to database...`);

  await saveArticles(technical);

  // 6. Generate 768-dim embeddings for all articles missing embeddings
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

  // 7. Backup full master archive to GCS
  console.log('Backing up full master archive to GCS (gs://ai-research-pulse-assets)...');
  const finalAllArticles = await getArticles(5000, undefined, 0, undefined, true);
  await backupArticlesToGCS(finalAllArticles);

  const stats = await getDBStats();
  console.log('=== Meta AI Backfill Complete ===');
  console.log('DB Stats:', JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error('Meta AI Backfill error:', err);
  process.exit(1);
});
