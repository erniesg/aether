import { expect, test } from '@playwright/test';

// Publisher seam — issue #9 Slice 1. Exercises the PreviewPublisher end-to-
// end via the right-rail `publish` lens. Falls back to the localStorage
// scheduled-post store when NEXT_PUBLIC_CONVEX_URL is unset (CI/dev default),
// so the spec is deterministic without needing Convex provisioned.

test.describe('H2 — publish preview (issue #9)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspace/demo-ws');
    await page.evaluate(() =>
      window.localStorage.removeItem('aether.scheduledPosts.v1')
    );
    await page.reload();
  });

  test('opening the publish lens shows an empty list by default', async ({
    page,
  }) => {
    await page.locator('[data-rail-section="scheduled"]').click();
    const flyout = page.locator('[data-rail-flyout="scheduled"]');
    await expect(flyout).toBeVisible();
    await expect(
      flyout.getByText(/schedule a preview to see it here/i)
    ).toBeVisible();
  });

  test('multi-platform schedule → list shows one row per platform → preview overlay renders every card', async ({
    page,
  }) => {
    await page.locator('[data-rail-section="scheduled"]').click();
    const flyout = page.locator('[data-rail-flyout="scheduled"]');
    await expect(flyout).toBeVisible();

    // instagram is preselected; add tiktok and linkedin.
    await flyout.getByTestId('publish-platform-tiktok').click();
    await flyout.getByTestId('publish-platform-linkedin').click();

    await flyout.getByTestId('publish-caption').fill('hero drop · multi');
    await flyout.getByTestId('publish-hashtags').fill('#aether #goldenhour');
    await flyout.getByTestId('publish-schedule-submit').click();

    const rows = flyout.locator('[data-scheduled-post-id]');
    await expect(rows).toHaveCount(3);

    // Overlay auto-opens on schedule via onOpenPreview.
    const overlay = page.getByTestId('publish-preview-overlay');
    await expect(overlay).toBeVisible();

    const cards = overlay.locator('[data-testid="publish-preview-card"]');
    await expect(cards).toHaveCount(3);
    const platforms = await cards.evaluateAll((nodes) =>
      (nodes as HTMLElement[]).map((n) => n.dataset.platform)
    );
    expect([...platforms].sort()).toEqual(['instagram', 'linkedin', 'tiktok']);

    // Close overlay.
    await overlay.getByTestId('publish-preview-close').click();
    await expect(overlay).toBeHidden();
  });

  test('cancel action drops the scheduled row', async ({ page }) => {
    await page.locator('[data-rail-section="scheduled"]').click();
    const flyout = page.locator('[data-rail-flyout="scheduled"]');

    await flyout.getByTestId('publish-caption').fill('drop me');
    await flyout.getByTestId('publish-schedule-submit').click();

    const overlay = page.getByTestId('publish-preview-overlay');
    await expect(overlay).toBeVisible();
    await overlay.getByTestId('publish-preview-close').click();

    const rows = flyout.locator('[data-scheduled-post-id]');
    await expect(rows).toHaveCount(1);

    await flyout.getByTestId('publish-scheduled-cancel').click();
    await expect(rows).toHaveCount(0);
  });

  test('deep-linking ?publishPreview=<id> auto-opens the overlay on mount', async ({
    page,
  }) => {
    // Schedule one post to produce an id + seed localStorage, then reload
    // with the deep-link query param and assert the overlay is present.
    await page.locator('[data-rail-section="scheduled"]').click();
    const flyout = page.locator('[data-rail-flyout="scheduled"]');
    await flyout.getByTestId('publish-caption').fill('deep link');
    await flyout.getByTestId('publish-schedule-submit').click();
    const overlay = page.getByTestId('publish-preview-overlay');
    await expect(overlay).toBeVisible();
    await overlay.getByTestId('publish-preview-close').click();

    const postId = await page
      .locator('[data-scheduled-post-id]')
      .first()
      .getAttribute('data-scheduled-post-id');
    expect(postId).toBeTruthy();

    await page.goto(`/workspace/demo-ws?publishPreview=${postId}`);
    await expect(page.getByTestId('publish-preview-overlay')).toBeVisible();
  });
});
