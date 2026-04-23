#!/usr/bin/env node
/**
 * mc-inspect — headless Playwright inspection of Mission Control.
 *
 * Logs in via legacy token (admin) and captures screenshots + sidebar HTML
 * + the full list of options in the client selector.
 *
 * Usage:
 *   node scripts/mc-inspect.mjs                     # default: staging, no client switch
 *   MC_BASE=http://localhost:3000 node scripts/mc-inspect.mjs
 *   MC_SLUG=growth4u node scripts/mc-inspect.mjs    # also switch to a client
 *   MC_OUT=/tmp/x node scripts/mc-inspect.mjs       # custom screenshot dir
 *
 * Env vars:
 *   MC_BASE         Base URL (default: https://staging.sanchocmo.ai)
 *   MC_ADMIN_TOKEN  Admin token (default: reads config/clients.json)
 *   MC_SLUG         If set, switches to that client and screenshots
 *   MC_OUT          Screenshot directory (default: screenshots/mc-inspect)
 *
 * Requires: playwright chromium browser — install once with:
 *   node_modules/.bin/playwright install chromium
 *   sudo node_modules/.bin/playwright install-deps chromium
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const BASE = process.env.MC_BASE || 'https://staging.sanchocmo.ai';
const SLUG = process.env.MC_SLUG || '';
const OUT = process.env.MC_OUT || resolve(REPO_ROOT, 'screenshots/mc-inspect');

function loadAdminToken() {
  if (process.env.MC_ADMIN_TOKEN) return process.env.MC_ADMIN_TOKEN;
  const cfg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/clients.json'), 'utf8'));
  if (!cfg.adminToken) throw new Error('No adminToken in config/clients.json and MC_ADMIN_TOKEN not set');
  return cfg.adminToken;
}

async function run() {
  const ADMIN_TOKEN = loadAdminToken();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`);
  });

  console.log(`\n=== MC INSPECT — ${BASE} ===\n`);

  // 1) Sign-in page
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(OUT, '01-signin.png'), fullPage: true });
  console.log('  ✅ 01-signin');

  // 2) Login via legacy-token
  await page.fill('input[name="token"]', ADMIN_TOKEN);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(OUT, '02-dashboard-global.png'), fullPage: true });
  console.log('  ✅ 02-dashboard-global');

  // 3) Sidebar (isolated)
  const sidebar = page.locator('aside').first();
  if (await sidebar.count()) {
    await sidebar.screenshot({ path: join(OUT, '03-sidebar.png') });
    const html = await sidebar.evaluate((el) => el.outerHTML);
    writeFileSync(join(OUT, 'sidebar.html'), html);
    console.log('  ✅ 03-sidebar  +  sidebar.html');
  } else {
    console.log('  ❌ sidebar <aside> not found');
  }

  // 4) Client selector options
  const selectHandle = page.locator('aside select').first();
  let options = [];
  if (await selectHandle.count()) {
    options = await selectHandle.evaluate((el) =>
      Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent?.trim() }))
    );
    writeFileSync(join(OUT, 'client-selector.json'), JSON.stringify(options, null, 2));
    console.log(`  ✅ client-selector.json (${options.length} options)`);
  } else {
    console.log('  ❌ client selector <select> not found');
  }

  // 5) Switch to a client (explicit SLUG or first available)
  const target = SLUG || options.find((o) => o.value && o.value !== 'global')?.value;
  if (target) {
    console.log(`\n--- Switching to client: ${target} ---`);
    await selectHandle.selectOption(target);
    await page.waitForURL(new RegExp(`/dashboard/${target}`), { timeout: 15000 }).catch(() => {
      console.log(`  ⚠️  did not reach /dashboard/${target}, current: ${page.url()}`);
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: join(OUT, '04-client-dashboard.png'), fullPage: true });
    console.log('  ✅ 04-client-dashboard');

    if (await page.locator('aside').first().count()) {
      await page.locator('aside').first().screenshot({ path: join(OUT, '05-sidebar-client.png') });
      console.log('  ✅ 05-sidebar-client');
    } else {
      console.log('  ⚠️  no <aside> on client page (e.g. Acceso denegado)');
    }

    writeFileSync(join(OUT, 'final-url.txt'), page.url());
  }

  if (consoleErrors.length) {
    writeFileSync(join(OUT, 'console-errors.log'), consoleErrors.join('\n'));
    console.log(`\n  ⚠️  ${consoleErrors.length} console errors → console-errors.log`);
  }

  await browser.close();

  console.log(`\n=== DONE → ${OUT} ===`);
  for (const f of readdirSync(OUT).sort()) {
    const size = statSync(join(OUT, f)).size;
    console.log(`  ${f}  (${size} bytes)`);
  }
}

run().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
