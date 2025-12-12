const cheerio = require('cheerio');

async function testScrape() {
  const sources = [
    'https://www.anthropic.com/research',
    'https://www.anthropic.com/engineering',
    'https://research.google/blog/',
    'https://deepmind.google/discover/blog/'
  ];

  for (const url of sources) {
    console.log(`\nTesting ${url}...`);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const html = await res.text();
      const $ = cheerio.load(html);
      
      let count = 0;
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href && (href.includes('/research/') || href.includes('/engineering/') || href.includes('/blog/'))) {
          if (count < 5) console.log(`- [${text}](${href})`);
          count++;
        }
      });
      console.log(`Found ${count} potential article links.`);
    } catch (e) {
      console.error(`Failed to fetch ${url}:`, e);
    }
  }
}

testScrape();
