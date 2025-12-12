const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const path = require('path');
const Parser = require('rss-parser');
const puppeteer = require('puppeteer');

const dbPath = path.join(__dirname, '../data/news.db');
const db = new Database(dbPath);
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

// Ensure table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    link TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    snippet TEXT,
    tags TEXT,
    embedding TEXT
  )
`);

const insertStmt = db.prepare(`
  INSERT INTO articles (title, link, date, source, snippet, tags, embedding)
  VALUES (@title, @link, @date, @source, @snippet, @tags, NULL)
  ON CONFLICT(link) DO UPDATE SET
    date = excluded.date,
    title = excluded.title,
    snippet = excluded.snippet,
    tags = excluded.tags
`);

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e.message);
    return null;
  }
}

function parseDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

async function scrapeAnthropic() {
  console.log('Scraping Anthropic...');
  const urls = ['https://www.anthropic.com/research', 'https://www.anthropic.com/engineering', 'https://www.anthropic.com/news'];
  
  for (const url of urls) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const $ = cheerio.load(html);
    
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('/research/team') || href === '/research' || href === '/engineering' || href === '/news') return;
      
      if (!href.includes('/research/') && !href.includes('/engineering/') && !href.includes('/news/')) return;

      const fullLink = href.startsWith('http') ? href : `https://www.anthropic.com${href}`;
      const text = $(el).text().trim();
      
      const dateMatch = text.match(/([A-Z][a-z]{2}\s\d{1,2},\s\d{4})/);
      let date = new Date().toISOString();
      if (dateMatch) {
        date = parseDate(dateMatch[0]);
      }
      
      if (text.length > 15) {
        let title = text;
        if (dateMatch) {
           title = text.replace(dateMatch[0], '').trim();
        }
        title = title.replace(/^Featured/i, '').trim();
        
        const parts = title.split(' ');
        if (parts.length > 1 && /^[a-z]+$/.test(parts[0]) && /^[A-Z]/.test(parts[1])) {
          title = parts.slice(1).join(' ');
        }

        console.log(`Found Anthropic: ${title}`);
        insertStmt.run({
          title: title.substring(0, 200),
          link: fullLink,
          date: date,
          source: 'Anthropic',
          snippet: 'Anthropic Research & Engineering',
          tags: '[]'
        });
      }
    });
  }
}

async function scrapeRSS(sourceName, url, snippetDefault) {
  console.log(`Scraping ${sourceName} from ${url}...`);
  try {
    const feed = await parser.parseURL(url);
    for (const item of feed.items) {
      if (!item.title || !item.link) continue;
      
      let tags = [];
      if (item.categories) {
        tags = item.categories.slice(0, 4);
      }
      
      console.log(`Found ${sourceName}: ${item.title}`);
      insertStmt.run({
        title: item.title.substring(0, 200),
        link: item.link,
        date: item.isoDate || new Date().toISOString(),
        source: sourceName,
        snippet: item.contentSnippet || snippetDefault,
        tags: JSON.stringify(tags)
      });
    }
  } catch (e) {
    console.error(`Error scraping ${sourceName}:`, e.message);
  }
}

async function scrapeMetaPuppeteer() {
  console.log('Scraping Meta AI with Puppeteer...');
  const url = 'https://ai.meta.com/blog/';
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    
    const articles = await page.evaluate(() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="/blog/"]'));
      
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href === '/blog/' || href.includes('/page/')) continue;
        
        const fullLink = href.startsWith('http') ? href : `https://ai.meta.com${href}`;
        const title = link.innerText.trim();
        
        if (!title || title.length < 10 || title === 'Read more') continue;
        
        results.push({
          title,
          link: fullLink,
          date: new Date().toISOString(), // Placeholder as date is hard to extract reliably without more logic
          source: 'Meta AI',
          snippet: 'Meta AI Blog'
        });
      }
      return results;
    });
    
    for (const article of articles) {
      console.log(`Found Meta AI: ${article.title}`);
      insertStmt.run({
        title: article.title.substring(0, 200),
        link: article.link,
        date: article.date,
        source: article.source,
        snippet: article.snippet,
        tags: '[]'
      });
    }
    
  } catch (e) {
    console.error('Error scraping Meta AI with Puppeteer:', e.message);
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  // Clear existing data
  db.exec('DELETE FROM articles'); 
  
  await scrapeAnthropic();
  await scrapeRSS('Google Research', 'https://research.google/blog/rss/', 'Google Research Blog');
  await scrapeRSS('Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'Google DeepMind Blog');
  await scrapeRSS('Microsoft Research', 'https://www.microsoft.com/en-us/research/feed/', 'Microsoft Research Blog');
  
  // Use Puppeteer for Meta
  await scrapeMetaPuppeteer();

  console.log('Backfill complete.');
}

main();
