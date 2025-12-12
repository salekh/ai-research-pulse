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

    // Navigate to Home
    console.log('Navigating to Home...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 60000 });

    // Click "Explore Full Feed" first to show tabs
    console.log('Clicking Explore Full Feed...');
    try {
        const exploreBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.textContent.includes('Explore Full Feed'));
        });
        
        if (exploreBtn.asElement()) {
            await exploreBtn.asElement().click();
            await page.waitForSelector('button[value="trends"]', { timeout: 10000 });
        } else {
            console.error('Explore Full Feed button not found');
        }
    } catch (e) {
        console.error('Error clicking explore button:', e);
    }

    // Click Trends tab
    console.log('Clicking Trends tab...');
    try {
        await page.click('button[value="trends"]');
        // Wait for chart/content
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        console.error('Error clicking trends button:', e);
    }

    console.log('Capturing Trends View...');
    await page.screenshot({ path: path.join(assetsDir, 'trends-view.png') });

    await browser.close();
    console.log('Done.');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();
