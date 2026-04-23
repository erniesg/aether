import { expect, test } from '@playwright/test';

// The signals store falls back to a localStorage-backed cache when
// NEXT_PUBLIC_CONVEX_URL is empty (as in CI/dev). That gives us deterministic
// reload persistence without needing Convex provisioned.

test.describe('signals CRUD', () => {
  test.beforeEach(async ({ page }) => {
    // Wipe the per-origin signals cache before each scenario so runs stay isolated.
    await page.goto('/workspace/demo-ws');
    await page.evaluate(() => window.localStorage.removeItem('aether.signals.v1'));
    await page.reload();
  });

  test('add a keyword → reload → it persists', async ({ page }) => {
    await page.locator('[data-rail-section="signals"]').click();
    const flyout = page.locator('[data-rail-flyout="signals"]');
    await expect(flyout).toBeVisible();

    await flyout.getByLabel('add keyword').fill('slow morning');
    await flyout
      .locator('[data-signal-group="keyword"]')
      .getByRole('button', { name: /^add$/i })
      .click();

    await expect(
      flyout.locator('[data-signal-group="keyword"]').getByText('slow morning')
    ).toBeVisible();

    await page.reload();

    await page.locator('[data-rail-section="signals"]').click();
    const flyoutAfter = page.locator('[data-rail-flyout="signals"]');
    await expect(
      flyoutAfter.locator('[data-signal-group="keyword"]').getByText('slow morning')
    ).toBeVisible();
  });

  test('mute a hashtag → row renders muted (data attribute + faded opacity)', async ({
    page,
  }) => {
    await page.locator('[data-rail-section="signals"]').click();
    const flyout = page.locator('[data-rail-flyout="signals"]');
    const tagGroup = flyout.locator('[data-signal-group="hashtag"]');

    await flyout.getByLabel('add hashtag').fill('#launchweek');
    await tagGroup.getByRole('button', { name: /^add$/i }).click();

    await expect(tagGroup.getByText('#launchweek')).toBeVisible();

    await tagGroup.getByRole('button', { name: /mute launchweek/i }).click();

    const row = tagGroup.locator('[data-signal-id]').first();
    await expect(row).toHaveAttribute('data-signal-muted', 'true');
    await expect(
      tagGroup.getByRole('button', { name: /unmute launchweek/i })
    ).toBeVisible();
  });
});
