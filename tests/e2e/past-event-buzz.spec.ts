import { expect, test } from '@playwright/test';

test.describe('Spec 02 — past event buzz', () => {
  test('creates a past mock event and shows the buzz strip on the report', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/vibes');

    await page
      .getByTestId('vibes-brief')
      .fill("Track AIE World's Fair 2025 across X, LinkedIn, and YouTube.");
    const scope = page.getByTestId('vibes-scope');
    await scope.locator('summary').click();
    await page.getByLabel('starts').fill('2025-06-03');
    await page.getByLabel('ends').fill('2025-06-05');
    await page.getByLabel('days before').fill('7');
    await page.getByLabel('days after').fill('14');

    await scope.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/02/past-date-scope.png',
    });

    await page.getByTestId('vibes-report').click();
    const summary = page.getByTestId('vibes-report-summary');
    await expect(summary).toBeVisible({ timeout: 90_000 });
    await expect(summary).toContainText('clusters');

    await page.getByTestId('vibes-open-report').click();
    await expect(page).toHaveURL(/\/events\//);
    const buzz = page.getByTestId('event-buzz-strip');
    await expect(buzz).toContainText(/run\.done|collect\./, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'clusters', exact: true })).toBeVisible();

    await page.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/02/past-event-buzz.png',
      fullPage: true,
    });
  });
});
