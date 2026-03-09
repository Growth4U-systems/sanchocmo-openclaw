const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  
  const mockups = [
    { file: 'mockup-linkedin-quote-brand.html', width: 1080, height: 1350, out: 'mockup-linkedin-quote-brand.png' },
  ];
  
  for (const m of mockups) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: m.width, height: m.height });
    const filePath = path.resolve(__dirname, m.file);
    await page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // wait for fonts
    await page.screenshot({ path: path.resolve(__dirname, m.out), fullPage: false });
    console.log(`✅ ${m.out}`);
    await page.close();
  }
  
  await browser.close();
  console.log('Done!');
})();
