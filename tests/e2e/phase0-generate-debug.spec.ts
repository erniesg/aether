/**
 * One-off generate-path debug — captures browser console + network during
 * an actual stg generate run. Not a regression test.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';

const baseURL = process.env.AETHER_BASE_URL ?? '';
const isStg = /aether-stg|aether\.berlayar/.test(baseURL);

test.describe('phase0 generate debug', () => {
  test.skip(!isStg, 'set AETHER_BASE_URL to stg');
  test.setTimeout(240_000);

  test('generate fan-out — capture console + activity log', async ({ page }) => {
    const consoleMsgs: string[] = [];
    page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

    const sseEvents: string[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('/api/generate') && res.request().method() === 'POST') {
        consoleMsgs.push(`[net] /api/generate -> ${res.status()} ${res.headers()['content-type'] ?? ''}`);
      }
    });

    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.tl-container')).toBeVisible({ timeout: 20_000 });

    // Snapshot frame ids on the canvas before generate
    const frameIds = await page.evaluate(() => {
      const editor = (window as unknown as { editor?: { getCurrentPageShapes(): Array<{ id: string; type: string; props?: { name?: string } }> } }).editor;
      if (!editor) return null;
      return editor
        .getCurrentPageShapes()
        .filter((s) => s.type === 'frame')
        .map((s) => ({ id: s.id, name: s.props?.name }));
    });
    consoleMsgs.push(`[frames-before] ${JSON.stringify(frameIds)}`);

    const composer = page.getByPlaceholder('describe the generation…');
    await composer.fill('a single ripe persimmon, studio still life, soft light');
    await page.getByRole('button', { name: /^generate$/i }).click();

    // Wait up to 3min for activity to settle
    const placedStatus = page.getByText(/placed (?:on canvas|\d+\/\d+ formats)/i);
    const result = await Promise.race([
      placedStatus.waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'placed'),
      new Promise<string>((r) => setTimeout(() => r('timeout-180s'), 180_000)),
    ]);
    consoleMsgs.push(`[outcome] ${result}`);

    // Open activity panel to read what events were processed
    const activityToggle = page.getByRole('button', { name: /show activity/i });
    if (await activityToggle.count()) {
      await activityToggle.first().click();
      const activityText = await page.locator('section').filter({
        has: page.getByText(/^activity$|formats|events/i),
      }).first().innerText().catch(() => '(activity not found)');
      consoleMsgs.push(`[activity] ${activityText}`);
    }

    const finalImages = await page.locator('.tl-container img').count();
    consoleMsgs.push(`[final-images] ${finalImages}`);

    await page.screenshot({
      path: path.resolve(process.cwd(), 'docs/handoffs/phase0-evidence/06-generate-debug.png'),
      fullPage: false,
    });

    // Log everything
    console.log('--- DEBUG LOG ---\n' + consoleMsgs.join('\n') + '\n--- END ---');
  });
});
