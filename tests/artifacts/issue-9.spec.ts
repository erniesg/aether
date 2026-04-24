import { test } from '@playwright/test';

// Artifact capture for PR #? (issue #9). Produces screenshots the reviewer
// agent + Ernie look at in #aether-review. Not a correctness test — the
// real assertions live in tests/e2e/publish-preview.spec.ts.

test.describe.configure({ mode: 'serial' });

test('publish preview — empty state', async ({ page }) => {
  await page.goto('/workspace/demo-ws');
  await page.evaluate(() =>
    window.localStorage.removeItem('aether.scheduledPosts.v1')
  );
  await page.reload();
  await page.locator('[data-rail-section="scheduled"]').click();
  await page.screenshot({
    path: 'playwright-report/issue-9/01-empty.png',
    fullPage: true,
  });
});

test('publish preview — multi-platform schedule + overlay', async ({
  page,
}) => {
  await page.goto('/workspace/demo-ws');
  await page.evaluate(() =>
    window.localStorage.removeItem('aether.scheduledPosts.v1')
  );
  await page.reload();

  await page.locator('[data-rail-section="scheduled"]').click();
  const flyout = page.locator('[data-rail-flyout="scheduled"]');
  await flyout.getByTestId('publish-platform-tiktok').click();
  await flyout.getByTestId('publish-platform-linkedin').click();
  await flyout.getByTestId('publish-caption').fill('hero drop · multi');
  await flyout.getByTestId('publish-hashtags').fill('#aether #goldenhour');
  await flyout.getByTestId('publish-schedule-submit').click();

  await page.getByTestId('publish-preview-overlay').waitFor();
  await page.screenshot({
    path: 'playwright-report/issue-9/02-preview-overlay.png',
    fullPage: true,
  });

  await page.getByTestId('publish-preview-close').click();
  await page.screenshot({
    path: 'playwright-report/issue-9/03-scheduled-list.png',
    fullPage: true,
  });
});
