const cheerio = require('cheerio');

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

async function main() {
  const url = 'https://deepmind.google/blog/';
  const html = await fetchHtml(url);
  if (!html) return;
  const $ = cheerio.load(html);
  
  // Search for "Genie 3" text to find the actual blog card
  const textNodes = $('*:contains("Genie 3")');
  console.log(`Found ${textNodes.length} elements with "Genie 3"`);
  
  textNodes.each((i, el) => {
    // We want the deepest element that contains the text
    if ($(el).children().length > 0) return; // Skip containers
    
    console.log(`\n--- Match ${i + 1} ---`);
    console.log('Tag:', el.tagName);
    console.log('Text:', $(el).text().trim());
    
    const parent = $(el).parent();
    console.log('Parent Tag:', parent.get(0).tagName);
    console.log('Parent Class:', parent.attr('class'));
    
    // Go up until we find a link or card
    let current = $(el);
    for (let j = 0; j < 5; j++) {
      current = current.parent();
      console.log(`Ancestor ${j + 1}: <${current.get(0).tagName} class="${current.attr('class')}">`);
      if (current.is('a')) {
        console.log('Found Link:', current.attr('href'));
      }
    }
  });
}

main();
