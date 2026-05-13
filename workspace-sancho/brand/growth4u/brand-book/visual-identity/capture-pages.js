#!/usr/bin/env node
// Capture each .page div from brand-book.html as a separate PNG
// Usage: node capture-pages.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const htmlPath = path.resolve(__dirname, 'brand-book.html');
  const outputDir = path.resolve(__dirname, 'pages');
  
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 }
  });
  
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  
  // Wait for fonts to load
  await page.waitForTimeout(2000);

  const pages = await page.$$('.page');
  console.log(`Found ${pages.length} pages`);

  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];
    const label = await el.getAttribute('data-label') || `page-${i + 1}`;
    const pageNum = String(i + 1).padStart(2, '0');
    const filename = `${pageNum}-${label}.png`;
    
    await el.screenshot({
      path: path.join(outputDir, filename),
      type: 'png'
    });
    
    console.log(`✅ ${filename}`);
  }

  await browser.close();
  console.log(`\nDone! ${pages.length} pages saved to ${outputDir}`);
})();
