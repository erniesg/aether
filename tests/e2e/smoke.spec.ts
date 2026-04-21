import { expect, test } from '@playwright/test';

test.describe('A1 — workspace smoke', () => {
  test('landing page renders and links to workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'aether' })).toBeVisible();
    await expect(page.getByRole('link', { name: /open demo workspace/i })).toBeVisible();
  });

  test('workspace route renders the four shell slots (taxonomy-tagged)', async ({ page }) => {
    await page.goto('/workspace/demo-ws');

    const leftRail = page.locator('[data-taxonomy="input"]').first();
    const canvas = page.locator('[data-taxonomy="tool"]').first();
    const rightRail = page.locator('[data-taxonomy="output"]').first();
    const composer = page.locator('[data-taxonomy="tool"]').nth(1);

    await expect(leftRail).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect(rightRail).toBeVisible();
    await expect(composer).toBeVisible();
  });

  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('aether');
    expect(body.deps).toHaveProperty('convex');
    expect(body.deps).toHaveProperty('anthropic');
  });
});
