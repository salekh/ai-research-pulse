const puppeteer = require('puppeteer');
const Parser = require('rss-parser');
const parser = new Parser();

async function main() {
  const url = 'https://ai.meta.com/blog/';
  console.log(`Launching browser for ${url}...`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle0' });
    
    // Extract articles
    const articles = await page.evaluate(() => {
      const results = [];
      // Meta's blog structure might vary, but usually links to /blog/title
      const links = Array.from(document.querySelectorAll('a[href*="/blog/"]'));
      
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href === '/blog/' || href.includes('/page/')) continue;
        
        const fullLink = href.startsWith('http') ? href : `https://ai.meta.com${href}`;
        const title = link.innerText.trim();
        
        // Filter out short titles or "Read more"
        if (!title || title.length < 10 || title === 'Read more') continue;
        
        // Try to find date in parent
        // This is heuristic and might need adjustment
        results.push({
          title,
          link: fullLink,
          date: new Date().toISOString(), // Placeholder
          source: 'Meta AI',
          snippet: 'Meta AI Blog'
        });
      }
      return results;
    });
    
    console.log(`Found ${articles.length} articles.`);
    if (articles.length > 0) {
      console.log('First item:', articles[0]);
    }
    
  } catch (e) {
    console.error('Puppeteer error:', e.message);
  } finally {
    await browser.close();
  }
}

main();
