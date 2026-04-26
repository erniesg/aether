/**
 * Offer + campaign persistence — focused regression coverage on top of the
 * brand persistence path already proven by phase0-stg-evidence.spec.ts.
 *
 * The two-phase hydration fix (commit bc49d53) applies the same pattern to
 * brand, offer, and campaign rails. Brand is verified by phase 0; this spec
 * verifies the offer + campaign half so we know the fix landed identically
 * on both, not just brand-by-luck.
 *
 * Run only against stg / prod:
 *   AETHER_BASE_URL=https://aether-stg.berlayar.ai \
 *     npx playwright test tests/e2e/offer-campaign-persistence.spec.ts \
 *     --project=chromium --workers=1
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

async function expandRail(page: import('@playwright/test').Page, id: 'offer' | 'campaign') {
  const trigger = page.locator(`[data-rail-section="${id}"]`);
  await trigger.click();
  const flyout = page.locator(`[data-rail-flyout="${id}"]`);
  await expect(flyout).toBeVisible();
  return flyout;
}

test.describe('offer + campaign rails — input persistence', () => {
  test.skip(!isStg, 'set AETHER_BASE_URL to stg/prod to run this regression');
  test.setTimeout(120_000);

  test('offer name persists across reload after explicit save', async ({ page }) => {
    const stamp = `Offer-${Date.now().toString().slice(-6)}`;

    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    let flyout = await expandRail(page, 'offer');
    const offerName = flyout.getByLabel('offer name');
    // .fill('') clears reliably across platforms (Ctrl+A doesn't select-all
    // on macOS Chromium — it's "go to start of line"). Then pressSequentially
    // exercises the auto-save / hydration race that the bug was about.
    await offerName.fill('');
    await offerName.pressSequentially(stamp, { delay: 60 });

    // OfferSection requires explicit save click — same pattern as BrandSection.
    // The two-phase hydration ensures the typed value isn't trampled by the
    // post-save echo from Convex.
    await flyout.getByRole('button', { name: /save/i }).click();
    await expect(flyout.getByText(/^saved$/i)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('06a-offer-saved') });

    await page.reload();
    await page.waitForLoadState('networkidle');

    flyout = await expandRail(page, 'offer');
    await expect(flyout.getByLabel('offer name')).toHaveValue(stamp);
    await page.screenshot({ path: shot('06b-offer-after-reload') });
  });

  test('offer name does NOT append on every keystroke (regression check)', async ({
    page,
  }) => {
    // The original bug Ernie reported: typing "tonight" produced
    // "ttotonitonigtonightonigttonigh" — each keystroke appended the
    // entire current value back onto itself because the controlled-input
    // value lagged the local state via a stale Convex hydration.
    const stamp = `Onlytonight-${Date.now().toString().slice(-4)}`;

    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    const flyout = await expandRail(page, 'offer');
    const offerName = flyout.getByLabel('offer name');
    await offerName.fill(''); // cross-platform clear
    // Type slowly with pauses — gives auto-save + Convex push time to land
    // back as a hydration on every keystroke. The bug appeared exactly here.
    for (const ch of stamp) {
      await offerName.press(ch);
      await page.waitForTimeout(40);
    }

    // Final value should equal what we typed, not a doubled / appended mess.
    await expect(offerName).toHaveValue(stamp);
  });

  test('campaign name + goal + audience persist across reload after explicit save', async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const name = `Campaign-${stamp}`;
    const goal = `goal-${stamp}`;
    const audience = `audience-${stamp}`;

    await page.goto('/workspace/demo-ws');
    await page.waitForLoadState('networkidle');

    let flyout = await expandRail(page, 'campaign');
    const campaignName = flyout.getByLabel('campaign name');
    const campaignGoal = flyout.getByLabel('campaign goal');
    const campaignAudience = flyout.getByLabel('campaign audience');

    await campaignName.fill('');
    await campaignName.pressSequentially(name, { delay: 50 });

    await campaignGoal.fill('');
    await campaignGoal.pressSequentially(goal, { delay: 50 });

    await campaignAudience.fill('');
    await campaignAudience.pressSequentially(audience, { delay: 50 });

    await flyout.getByRole('button', { name: /save/i }).click();
    await expect(flyout.getByText(/^saved$/i)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot('06c-campaign-saved') });

    await page.reload();
    await page.waitForLoadState('networkidle');

    flyout = await expandRail(page, 'campaign');
    await expect(flyout.getByLabel('campaign name')).toHaveValue(name);
    await expect(flyout.getByLabel('campaign goal')).toHaveValue(goal);
    await expect(flyout.getByLabel('campaign audience')).toHaveValue(audience);
    await page.screenshot({ path: shot('06d-campaign-after-reload') });
  });
});
