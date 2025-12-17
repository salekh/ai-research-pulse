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

    const baseUrl = 'http://localhost:3007';

    // 1. Full Feed Test
    console.log('1. Testing Full Feed...');
    await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Click "Explore Full Feed"
    console.log('Clicking Explore Full Feed...');
    try {
        const exploreBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.textContent.includes('Explore Full Feed'));
        });
        
        if (exploreBtn.asElement()) {
            await exploreBtn.asElement().click();
            await page.waitForSelector('.grid', { timeout: 10000 });
            await new Promise(r => setTimeout(r, 3000)); // Wait for images
            await page.screenshot({ path: path.join(assetsDir, 'full-feed.png') });
            console.log('Captured full-feed.png');
        } else {
            console.error('Explore Full Feed button not found');
        }
    } catch (e) {
        console.error('Error in Full Feed test:', e);
    }

    // 2. Search Test
    console.log('2. Testing Search...');
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });
    try {
        await page.waitForSelector('input[type="text"]', { timeout: 5000 });
        await page.type('input[type="text"]', 'Gemini');
        await page.keyboard.press('Enter');
        
        await page.waitForSelector('.grid', { timeout: 10000 });
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: path.join(assetsDir, 'search-results.png') });
        console.log('Captured search-results.png');
    } catch (e) {
        console.error('Error in Search test:', e);
    }

    // 3. I'm Feeling Lucky Test
    console.log('3. Testing I\'m Feeling Lucky...');
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });
    try {
        const luckyBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.textContent.includes("I'm Feeling Lucky"));
        });

        if (luckyBtn.asElement()) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                luckyBtn.asElement().click()
            ]);
            
            const url = page.url();
            console.log('Redirected to:', url);
            
            if (url.includes(baseUrl)) {
                 console.warn('Warning: Still on localhost, might not have redirected correctly or internal article.');
            }
            
            await page.screenshot({ path: path.join(assetsDir, 'lucky-result.png') });
            console.log('Captured lucky-result.png');
        } else {
            console.error('Lucky button not found');
        }
    } catch (e) {
        console.error('Error in Lucky test:', e);
    }

    await browser.close();
    console.log('Done.');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();
