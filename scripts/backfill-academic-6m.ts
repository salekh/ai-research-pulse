import fs from 'fs';
import path from 'path';
import {
  RawAcademicCandidate,
  fetchHuggingFacePapers,
  fetchOpenAlexTopArxivPapers,
  fetchLatestArxivPapers,
  enrichWithArxivApi,
  finalizeAndSaveAcademicCandidates,
} from '../lib/academic-ingestion';
import { getArticles } from '../lib/db';
import { backupArticlesToGCS } from '../lib/gcs-archive';

// Load .env.local for standalone script execution
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim();
    }
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fromDate = '2026-05-25';
  const toDate = '2026-11-25';
  const minDateIso = `${fromDate}T00:00:00.000Z`;

  console.log(`=== Academic Research 6-Month Backfill (${fromDate} -> ${toDate}) ===`);
  const candidates = new Map<string, RawAcademicCandidate>();

  const merge = (list: RawAcademicCandidate[], label: string) => {
    let added = 0;
    for (const item of list) {
      const prev = candidates.get(item.arxivId);
      if (!prev) {
        candidates.set(item.arxivId, item);
        added++;
      } else {
        prev.citationCount = Math.max(prev.citationCount, item.citationCount);
        if (!prev.primaryCategory && item.primaryCategory) prev.primaryCategory = item.primaryCategory;
        if (item.abstract.length > prev.abstract.length) prev.abstract = item.abstract;
        if (item.authors.length > prev.authors.length) prev.authors = item.authors;
        if (!prev.aiSummaryHint && item.aiSummaryHint) prev.aiSummaryHint = item.aiSummaryHint;
      }
    }
    console.log(`  [${label}] fetched=${list.length}, newlyAdded=${added}, totalUnique=${candidates.size}`);
  };

  // 1. Hugging Face Daily Papers across every month of the 6-month window (top community-upvoted arXiv papers)
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  for (const month of months) {
    const limit = month === '2026-05' ? 25 : 42;
    const hfMonth = await fetchHuggingFacePapers(`month=${month}&limit=${limit}`, minDateIso);
    merge(hfMonth, `HF month=${month}`);
    await delay(300);
  }

  // Also fetch latest HF daily papers (this week)
  const hfLatest = await fetchHuggingFacePapers('limit=40', minDateIso);
  merge(hfLatest, 'HF latest');

  // 2. OpenAlex top-cited arXiv AI/LLM/Intelligence/Learning papers across the 6-month window
  const openAlexQueries = [
    'large language model OR reasoning OR test-time compute',
    'AI agent OR reinforcement learning OR alignment',
    'world model OR multimodal OR continual learning OR interpretability',
  ];
  for (const q of openAlexQueries) {
    const oaList = await fetchOpenAlexTopArxivPapers(fromDate, toDate, q, 30);
    merge(oaList, `OpenAlex (${q.slice(0, 28)}...)`);
    await delay(300);
  }

  // 3. Official arXiv API: latest cs.AI / cs.LG / cs.CL preprints right now
  const arxivLatest = await fetchLatestArxivPapers(45);
  merge(arxivLatest, 'arXiv latest cs.AI/LG/CL');

  // 4. Authoritative arXiv API enrichment for primaryCategory, clean authors, and full abstracts
  // (strictly respects >= 3.2s delay between batches per arXiv Terms of Use)
  console.log(`\nEnriching ${candidates.size} unique arXiv papers via official arXiv API (3.2s rate limit)...`);
  await delay(3200);
  await enrichWithArxivApi(candidates);

  // 5. Filter, batch-summarize via Gemini 4 Hydrogen (abstract only), embed (768-dim), and persist
  const saved = await finalizeAndSaveAcademicCandidates(candidates, {
    skipGcsBackup: true,
    maxPapers: 280,
  });

  console.log(`\nSaved ${saved.length} academic papers across local SQLite & active DB.`);
  const monthCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  for (const p of saved) {
    const m = p.date.slice(0, 7);
    monthCounts[m] = (monthCounts[m] || 0) + 1;
    catCounts[p.primaryCategory] = (catCounts[p.primaryCategory] || 0) + 1;
  }
  console.log('Monthly coverage:', monthCounts);
  console.log('arXiv track distribution:', catCounts);

  // 6. Export full unified 3-tier backup to GCS Master Archive (Labs + Academic separated by category)
  const allRows = await getArticles(10000, undefined, 0, undefined, true, 'all');
  console.log(`Exporting ${allRows.length} total records (Lab + Academic) to GCS Master Archive...`);
  await backupArticlesToGCS(allRows);
  console.log('=== Academic 6-Month Backfill Complete ===');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
