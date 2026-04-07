/**
 * Visual test script — takes screenshots of every page in Mission Control.
 * Run: node scripts/visual-test.mjs
 * Requires: npx playwright install chromium (one-time)
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3005';
const ADMIN_TOKEN = 'cc9b8067c18c5214358611d75f151f6d';
const SLUG = 'hospital-capilar';
const SCREENSHOTS_DIR = 'screenshots/test';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const fs = await import('fs');
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  async function screenshot(name, url, opts = {}) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      if (opts.wait) await page.waitForTimeout(opts.wait);
      const path = `${SCREENSHOTS_DIR}/${name}.png`;
      await page.screenshot({ path, fullPage: opts.fullPage || false });
      console.log(`  ✅ ${name} → ${path}`);
    } catch (e) {
      console.log(`  ❌ ${name} → ${e.message.slice(0, 80)}`);
    }
  }

  console.log('\n=== MISSION CONTROL — VISUAL TEST ===\n');

  // 1. Landing
  console.log('--- Public pages ---');
  await screenshot('01-landing', `${BASE}/`);
  await screenshot('02-signin', `${BASE}/auth/signin`);

  // 2. Login
  console.log('--- Login ---');
  await page.goto(`${BASE}/auth/signin`);
  await page.fill('input[name="token"]', ADMIN_TOKEN);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
  console.log('  ✅ Logged in');

  // 3. Dashboard Global
  console.log('--- Dashboard ---');
  await screenshot('03-dashboard-global', `${BASE}/dashboard`, { wait: 2000 });

  // 4. Select client → Dashboard V2
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(1000);
  const selector = await page.$('select');
  if (selector) {
    await selector.selectOption(SLUG);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-dashboard-v2-client.png` });
    console.log(`  ✅ 04-dashboard-v2-client`);
  }

  // 5. Foundation
  console.log('--- Client pages ---');
  await screenshot('05-foundation', `${BASE}/dashboard/${SLUG}/foundation`, { wait: 2000, fullPage: true });
  await screenshot('06-projects', `${BASE}/dashboard/${SLUG}/projects`, { wait: 2000 });
  await screenshot('07-ideas', `${BASE}/dashboard/${SLUG}/ideas`, { wait: 2000, fullPage: true });
  await screenshot('08-trust-engine', `${BASE}/dashboard/${SLUG}/trust-engine`, { wait: 2000, fullPage: true });
  await screenshot('09-metrics', `${BASE}/dashboard/${SLUG}/metrics`, { wait: 2000 });
  await screenshot('10-recurring-tasks', `${BASE}/dashboard/${SLUG}/recurring-tasks`, { wait: 2000 });

  // 6. Admin pages
  console.log('--- Admin pages ---');
  await screenshot('11-activity', `${BASE}/dashboard/admin/activity`, { wait: 2000 });
  await screenshot('12-tasks-cervantes', `${BASE}/dashboard/admin/tasks`, { wait: 1000 });
  await screenshot('13-changelog', `${BASE}/dashboard/changelog`, { wait: 1000 });
  await screenshot('14-guide', `${BASE}/dashboard/guide`, { wait: 1000 });

  // 7. Dark mode
  console.log('--- Dark mode ---');
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(1000);
  // Click dark mode button
  const darkBtn = await page.$('button:has-text("Dark")');
  if (darkBtn) {
    await darkBtn.click();
    await page.waitForTimeout(500);
    await screenshot('15-dark-dashboard', `${BASE}/dashboard`, { wait: 1000 });

    // Select client in dark mode
    const sel2 = await page.$('select');
    if (sel2) {
      await sel2.selectOption(SLUG);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/16-dark-dashboard-v2.png` });
      console.log(`  ✅ 16-dark-dashboard-v2`);
    }

    await screenshot('17-dark-foundation', `${BASE}/dashboard/${SLUG}/foundation`, { wait: 2000, fullPage: true });
    await screenshot('18-dark-trust-engine', `${BASE}/dashboard/${SLUG}/trust-engine`, { wait: 2000, fullPage: true });
  }

  console.log('\n=== DONE ===\n');
  await browser.close();
}

run().catch(console.error);
