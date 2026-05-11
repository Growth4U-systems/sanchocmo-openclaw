import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('home renders without crashing', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('protected dashboard redirects unauthenticated user', async ({ page }) => {
    const response = await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    const url = page.url();
    const isAuthFlow = /\/(login|signin|api\/auth)/i.test(url);
    expect(isAuthFlow || response?.status() === 401 || response?.status() === 403).toBeTruthy();
  });
});
