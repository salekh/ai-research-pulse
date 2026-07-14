import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { FEEDS } from '../lib/ingestion';
import { saveArticles, Article } from '../lib/db';
import { filterTechnicalArticles } from '../lib/content-filter';
import Parser from 'rss-parser';

const parser = new Parser();

async function fetchAndSaveRSS() {
  console.log('Starting RSS fetch...');

  const allNew: Article[] = [];

  await Promise.all(
    FEEDS.map(async (feed) => {
      console.log(`Fetching ${feed.source}...`);
      try {
        const parsed = await parser.parseURL(feed.url);
        console.log(`  ${feed.source}: ${parsed.items.length} items`);

        for (const item of parsed.items) {
          const title = item.title;
          const link = item.link;
          if (!title || !link) continue;

          allNew.push({
            title,
            link,
            date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            source: feed.source as Article['source'],
            snippet: (item.contentSnippet || item.content || '').substring(0, 500),
          });
        }
      } catch (err) {
        console.error(`  Error fetching ${feed.source}:`, err);
      }
    }),
  );

  console.log(`Fetched ${allNew.length} total articles. Filtering technical ones...`);
  const valid = await filterTechnicalArticles(allNew);
  console.log(`Keeping ${valid.length} technical articles. Saving...`);

  // saveArticles uses ON CONFLICT DO UPDATE — safe to call even for existing articles
  await saveArticles(valid);
  console.log('Done.');
  process.exit(0);
}

fetchAndSaveRSS().catch((e) => {
  console.error(e);
  process.exit(1);
});
