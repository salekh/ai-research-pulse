const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const assetsDir = path.join(__dirname, '../public/assets');
    if (!fs.existsSync(assetsDir)){
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Home Feed
    console.log('Navigating to Home...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Click "Explore Full Feed" to show the actual feed
    console.log('Clicking Explore Full Feed...');
    try {
        const exploreBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.textContent.includes('Explore Full Feed'));
        });
        
        if (exploreBtn.asElement()) {
            await exploreBtn.asElement().click();
            // Wait for feed to load
            await page.waitForSelector('.grid', { timeout: 10000 }); // Assuming grid layout for cards
            await new Promise(r => setTimeout(r, 3000)); // Extra wait for images/animations
        } else {
            console.error('Explore Full Feed button not found');
        }
    } catch (e) {
        console.error('Error clicking explore button:', e);
    }

    console.log('Capturing Home Feed...');
    await page.screenshot({ path: path.join(assetsDir, 'home-feed.png') });

    await browser.close();
    console.log('Done.');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();
