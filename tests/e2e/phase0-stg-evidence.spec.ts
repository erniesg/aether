/**
 * Phase 0 evidence harness — drives stg in a real browser to confirm what's
 * actually demoable end-to-end. Run only with AETHER_BASE_URL pointed at stg.
 *
 * Usage:
 *   AETHER_BASE_URL=https://aether-stg.berlayar.ai \
 *     npx playwright test tests/e2e/phase0-stg-evidence.spec.ts \
 *     --project=chromium --reporter=list
 *
 * Screenshots land in docs/handoffs/phase0-evidence/.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';

const baseURL = process.env.AETHER_BASE_URL ?? '';
const isStg = /aether-stg|aether\.berlayar/.test(baseURL);

const evidenceDir = path.resolve(
  process.cwd(),
  'docs/handoffs/phase0-evidence'
);
const shot = (name: string) => path.join(evidenceDir, `${name}.png`);

// Each test navigates fresh; isolation > shared state for evidence runs.
// Removing 'serial' so a single failure doesn't cascade-skip remaining checks.

test.describe('Phase 0 — stg evidence packet', () => {
  test.skip(!isStg, 'set AETHER_BASE_URL to stg to record evidence');
  test.setTimeout(180_000);

  test('00 workspace renders shell taxonomy', async ({ page }) => {
    await page.goto('/workspace/demo-ws');
    await expect(page.locator('[data-taxonomy="input"]').first()).toBeVisible();
    await expect(page.locator('[data-taxonomy="tool"]').first()).toBeVisible();
    await expect(page.locator('[data-taxonomy="output"]').first()).toBeVisible();
    await page.screenshot({ path: shot('00-shell'), fullPage: false });
  });

  test('01 brand persistence — name + hex stick across reload', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    const brandTrigger = page.locator('[data-rail-section="brand"]');
    await brandTrigger.click();

    let flyout = page.locator('[data-rail-flyout="brand"]');
    await expect(flyout).toBeVisible();
    await page.screenshot({ path: shot('01a-brand-flyout-open') });

    const stamp = `Phase0-${Date.now().toString().slice(-6)}`;
    await flyout.getByLabel('brand name').fill(stamp);
    await flyout.getByLabel('hex colour 1').fill('#ef3340');
    const saveBtn = flyout.getByRole('button', { name: /save/i });
    await saveBtn.click();

    // saved indicator (best-effort; some builds may not show it)
    await expect(flyout.getByText(/^saved$/i)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('01b-brand-saved') });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-rail-section="brand"]').click();
    flyout = page.locator('[data-rail-flyout="brand"]');
    await expect(flyout).toBeVisible();
    await expect(flyout.getByLabel('brand name')).toHaveValue(stamp);
    await page.screenshot({ path: shot('01c-brand-after-reload') });
  });

  test('02 type-font preview renders custom families', async ({ page }) => {
    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-rail-section="brand"]').click();
    const flyout = page.locator('[data-rail-flyout="brand"]');
    await expect(flyout).toBeVisible();

    await flyout.getByRole('textbox', { name: 'brand type 1' }).fill('Fraunces');
    const t2 = flyout.getByRole('textbox', { name: 'brand type 2' });
    if (await t2.count()) {
      await t2.fill('JetBrains Mono');
    }
    await flyout.getByRole('button', { name: /save/i }).click();
    await expect(flyout.getByText(/^saved$/i)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('02-type-preview') });
  });

  test('03 settings popover — voice provider persists across reload', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    const settings = page.locator('[aria-label="settings"]');
    await settings.click();

    const popover = page.locator('[aria-label="workspace provider settings"]');
    await expect(popover).toBeVisible();
    await page.screenshot({ path: shot('03a-settings-open') });

    const voice = popover.locator('[aria-label="voice"]');
    const before = await voice.inputValue();
    const target = before === 'gemini-live' ? 'openai-realtime' : 'gemini-live';
    await voice.selectOption(target);

    // many popovers persist on change; if there's a save button click it.
    const save = popover.getByRole('button', { name: /save|apply/i });
    if (await save.count()) {
      await save.first().click();
    }
    await page.screenshot({ path: shot('03b-settings-changed') });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[aria-label="settings"]').click();
    const popover2 = page.locator('[aria-label="workspace provider settings"]');
    await expect(popover2).toBeVisible();
    await expect(popover2.locator('[aria-label="voice"]')).toHaveValue(target);
    await page.screenshot({ path: shot('03c-settings-after-reload') });

    // restore to gemini-live mandate
    await popover2.locator('[aria-label="voice"]').selectOption('gemini-live');
    const save2 = popover2.getByRole('button', { name: /save|apply/i });
    if (await save2.count()) await save2.first().click();
  });

  test('04 generate — composer prompt → image lands on canvas', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    // Wait for tldraw to be ready (matches generate.spec.ts pattern)
    await expect(page.locator('.tl-container')).toBeVisible({ timeout: 20_000 });
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    const initialImages = await page.locator('.tl-container img').count();

    const composer = page.getByPlaceholder('describe the generation…');
    await expect(composer).toBeVisible();
    await composer.fill('a single ripe persimmon, studio still life, soft light');
    await page.screenshot({ path: shot('04a-composer-filled') });

    await page.getByRole('button', { name: /^generate$/i }).click();

    // Up to 3 minutes — stg uses real OpenAI gpt-image-1, not a mock.
    const placedStatus = page.getByText(/placed (?:on canvas|\d+\/\d+ formats)/i);
    const errorStatus = page.getByRole('alert');

    let outcome: 'placed' | 'error' | 'timeout';
    try {
      const winner = await Promise.race([
        placedStatus.waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'placed' as const),
        errorStatus.waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'error' as const),
      ]);
      outcome = winner;
    } catch {
      outcome = 'timeout';
    }

    const finalImages = await page.locator('.tl-container img').count();
    const newImages = finalImages - initialImages;

    await page.screenshot({
      path: shot(`04b-generate-${outcome}-imgs+${newImages}`),
      fullPage: false,
    });
  });

  test('05 brand auto-propose — URL ingest surfaces offer cards', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');
    // Clear any prior local state so the propose path runs fresh.
    await page.evaluate(() => window.localStorage.removeItem('aether.brand.v1'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('[data-rail-section="brand"]').click();
    const flyout = page.locator('[data-rail-flyout="brand"]');
    await expect(flyout).toBeVisible();

    const sourceInput = flyout.getByLabel('brand source');
    await sourceInput.fill('https://stripe.com');
    await page.screenshot({ path: shot('05a-before-ingest') });

    const ingestBtn = flyout.getByRole('button', { name: /ingest/i });
    await ingestBtn.click();

    // After Track A: the brand panel itself only renders loading / error;
    // the AI-suggested cards live on the offer + campaign rails. Watching
    // the brand-panel error or offer-rail cards (post-rail-open) is the
    // strongest propose signal.
    const proposeError = page.locator('[data-testid="propose-error"]');
    const proposeLoading = page.locator('[data-testid="propose-loading"]');

    const verdict = await Promise.race([
      proposeLoading
        .waitFor({ state: 'hidden', timeout: 90_000 })
        .then(() => 'completed'),
      proposeError.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'error'),
    ]).catch(() => 'timeout');

    await page.screenshot({ path: shot(`05b-propose-${verdict}`), fullPage: true });
  });
});
