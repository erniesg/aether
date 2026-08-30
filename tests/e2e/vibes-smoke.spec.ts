import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the Vibes research shell and the linked report page.
 * Runs entirely in mock mode (no provider credits) against the local dev
 * server, which Playwright starts with VIBES_DAILY_CALL_LIMIT so the
 * local-dev auth fallback has quota.
 */
test.describe('vibes smoke', () => {
  test('/vibes opens straight into the research shell', async ({ page }) => {
    await page.goto('/vibes');

    // The first viewport is the shell — brief, frontier, report — not a
    // marketing hero or an API console.
    await expect(page.getByTestId('vibes-brief')).toBeVisible();
    await expect(page.getByTestId('vibes-frontier')).toBeVisible();
    await expect(page.getByTestId('vibes-report')).toBeVisible();
    await expect(page.getByTestId('vibes-access')).toBeVisible();
  });

  test('access controls are secondary, disclosed from the header', async ({ page }) => {
    await page.goto('/vibes');
    await expect(page.getByPlaceholder('vibes_vk_...')).toBeHidden();
    await page.getByTestId('vibes-access').click();
    await expect(page.getByPlaceholder('vibes_vk_...')).toBeVisible();
  });

  test('runs a mock report and opens the authed report page', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/vibes');

    await page
      .getByTestId('vibes-brief')
      .fill('Track the Aurora keyboard launch across X, LinkedIn, and YouTube.');
    await page.getByTestId('vibes-report').click();

    // Artifact-first result — counts, run status, open-report action.
    const summary = page.getByTestId('vibes-report-summary');
    await expect(summary).toBeVisible({ timeout: 90_000 });
    await expect(summary.getByText(/^run (done|running|failed)$/)).toBeVisible();

    const openReport = page.getByTestId('vibes-open-report');
    await expect(openReport).toBeVisible();
    await openReport.click();

    // Report page loads with auth (no key in the URL) and shows the run panel.
    await expect(page).toHaveURL(/\/events\//);
    expect(page.url()).not.toContain('vibes_vk_');
    await expect(page.getByRole('heading', { name: 'run', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'clusters' })).toBeVisible();
  });

  test('estimate action and scope controls are in the shell', async ({ page }) => {
    await page.goto('/vibes');

    // Pre-flight: estimate (dry run) sits alongside frontier and report.
    await expect(page.getByTestId('vibes-estimate')).toBeVisible();

    // Scope is a collapsed disclosure — progressive disclosure, not a wall of knobs.
    const scope = page.getByTestId('vibes-scope');
    await expect(scope).toBeVisible();
    await expect(page.getByPlaceholder('auto').first()).toBeHidden();
    await scope.locator('summary').click();
    await expect(page.getByPlaceholder('auto').first()).toBeVisible();
  });
});
