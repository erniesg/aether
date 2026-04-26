import { expect, test } from '@playwright/test';

/**
 * Track G — composer "schedule pack" UI fan-out.
 * Opens the workspace, picks 4 platforms in the publish lens, and asserts the
 * scheduled-list grows to 4 rows each with a `scheduled` status pill.
 *
 * Runs against the local PreviewPublisher (NEXT_PUBLIC_CONVEX_URL unset),
 * which is enough to validate the UI seam — the Postiz wiring is exercised
 * by `tests/integration/postiz-sidecar.test.ts`.
 */

test.describe('Track G — schedule pack (4 platforms)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspace/demo-ws');
    await page.evaluate(() =>
      window.localStorage.removeItem('aether.scheduledPosts.v1')
    );
    await page.reload();
  });

  test('schedules a 4-platform pack and renders 4 scheduled status pills', async ({
    page,
  }) => {
    await page.locator('[data-rail-section="scheduled"]').click();
    const flyout = page.locator('[data-rail-flyout="scheduled"]');
    await expect(flyout).toBeVisible();

    // instagram is preselected; add x, linkedin, pinterest to make a 4-pack.
    await flyout.getByTestId('publish-platform-x').click();
    await flyout.getByTestId('publish-platform-linkedin').click();
    await flyout.getByTestId('publish-platform-pinterest').click();

    await flyout.getByTestId('publish-caption').fill('hero pack · slow glow');
    await flyout.getByTestId('publish-hashtags').fill('#aether #launch');
    await flyout.getByTestId('publish-schedule-submit').click();

    const overlay = page.getByTestId('publish-preview-overlay');
    await expect(overlay).toBeVisible();
    await overlay.getByTestId('publish-preview-close').click();

    const rows = flyout.locator('[data-scheduled-post-id]');
    await expect(rows).toHaveCount(4);

    const platforms = await rows.evaluateAll((nodes) =>
      (nodes as HTMLElement[]).map((n) => n.dataset.scheduledPostPlatform)
    );
    expect([...platforms].sort()).toEqual([
      'instagram',
      'linkedin',
      'pinterest',
      'x',
    ]);

    // Each row shows the `scheduled` status pill.
    const pills = flyout.locator(
      '[data-scheduled-post-id] :text-is("scheduled")'
    );
    await expect(pills).toHaveCount(4);
  });
});
