import { expect, test } from '@playwright/test';

const PINTEREST_RECORD = {
  id: 'ref_pin_test',
  kind: 'image',
  previewUrl: 'https://i.pinimg.com/originals/ab/cd/ef/solstice-preview.jpg',
  fullUrl: 'https://www.pinterest.com/pin/123456789/',
  attribution: {
    source: 'pinterest',
    author: 'Solstice Studio',
    url: 'https://www.pinterest.com/pin/123456789/',
  },
  capturedAt: '2026-04-24T12:00:00.000Z',
};

const FALLBACK_RECORD = {
  id: 'ref_generic_bare',
  kind: 'embed',
  previewUrl: 'https://plain.example.com/notes',
  fullUrl: 'https://plain.example.com/notes',
  attribution: { source: 'generic', url: 'https://plain.example.com/notes' },
  capturedAt: '2026-04-24T12:00:00.000Z',
};

test.describe('references multi-source ingest', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('aether.references.v1');
    });
  });

  test('pasting a Pinterest URL lands a chip in the Images sub-tab', async ({
    page,
  }) => {
    await page.route('**/api/reference-ingest', async (route) => {
      const req = route.request();
      expect(req.method()).toBe('POST');
      const body = req.postDataJSON() as Record<string, unknown>;
      expect(body.url).toBe('https://www.pinterest.com/pin/123456789/');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          record: PINTEREST_RECORD,
          fallback: false,
          providerId: 'pinterest',
        }),
      });
    });

    await page.goto('/workspace/demo-ws');

    await page.locator('[data-rail-section="references"]').click();
    const flyout = page.locator('[data-rail-flyout="references"]');
    await expect(flyout).toBeVisible();

    // Images sub-tab is the default.
    await expect(flyout.getByRole('tab', { name: 'images' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    const input = flyout.getByLabel('reference source');
    await input.fill('https://www.pinterest.com/pin/123456789/');
    await flyout.getByRole('button', { name: /^ingest$/i }).click();

    const chip = flyout.locator('[data-testid="reference-chip"]').first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-reference-source', 'pinterest');
    await expect(chip).toHaveAttribute('data-reference-kind', 'image');
    await expect(chip.getByRole('img')).toHaveAttribute(
      'src',
      PINTEREST_RECORD.previewUrl
    );
  });

  test('link-only fallback shows a toast + keeps the URL pinned', async ({
    page,
  }) => {
    await page.route('**/api/reference-ingest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          record: FALLBACK_RECORD,
          fallback: true,
          providerId: 'generic',
        }),
      });
    });

    await page.goto('/workspace/demo-ws');
    await page.locator('[data-rail-section="references"]').click();
    const flyout = page.locator('[data-rail-flyout="references"]');

    await flyout.getByLabel('reference source').fill('https://plain.example.com/notes');
    await flyout.getByRole('button', { name: /^ingest$/i }).click();

    const toast = flyout.locator('[data-testid="references-toast"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/link-only/i);

    const chip = flyout.locator('[data-testid="reference-chip"]').first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-reference-kind', 'embed');
  });
});
