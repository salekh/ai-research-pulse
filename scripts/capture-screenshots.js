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

    // Home Feed
    console.log('Navigating to Home...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait a bit for any client-side hydration or animations
    await new Promise(r => setTimeout(r, 3000));
    
    const assetsDir = path.join(__dirname, '../public/assets');
    if (!fs.existsSync(assetsDir)){
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    console.log('Capturing Home Feed...');
    await page.screenshot({ path: path.join(assetsDir, 'home-feed.png') });

    // Trends
    console.log('Navigating to Trends...');
    // Try to find the tab trigger for "trends"
    // It's likely a button with role="tab" and value="trends" or text "Trends"
    const trendsTab = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Trends'));
    });

    if (trendsTab) {
        await trendsTab.click();
        // Wait for chart to load (it fetches from API)
        await new Promise(r => setTimeout(r, 5000)); 
        console.log('Capturing Trends View...');
        await page.screenshot({ path: path.join(assetsDir, 'trends-view.png') });
    } else {
        console.error('Trends tab not found');
    }

    await browser.close();
    console.log('Done.');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();
