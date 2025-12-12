const Parser = require('rss-parser');
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml; q=0.1',
  },
  timeout: 10000,
});

async function main() {
  const urls = [
    'https://ai.meta.com/blog/rss.xml/',
    'https://ai.meta.com/blog/rss.xml',
  ];

  for (const url of urls) {
    console.log(`Trying fetch ${url}...`);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml; q=0.1',
        }
      });
      console.log(`Status: ${res.status}`);
      if (!res.ok) {
        console.log('Text:', await res.text());
        continue;
      }
      
      const text = await res.text();
      console.log(`Got text length: ${text.length}`);
      
      const feed = await parser.parseString(text);
      console.log(`Success! Found ${feed.items.length} items.`);
      if (feed.items.length > 0) {
        console.log('First item:', feed.items[0].title);
      }
      return;
    } catch (e) {
      console.error(`Failed: ${e.message}`);
    }
  }
}

main();
