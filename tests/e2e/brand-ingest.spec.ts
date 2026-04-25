import { expect, test } from '@playwright/test';

const SNAPSHOT_FIXTURE = {
  ok: true,
  snapshot: {
    palette: [
      { hex: '#0f1013', role: 'primary' },
      { hex: '#e8e4d6', role: 'accent' },
      { hex: '#c48b5e', role: 'neutral' },
    ],
    typography: [
      { family: 'Canela Deck', role: 'display' },
      { family: 'Inter', role: 'body' },
    ],
    voice: { samples: ['Slow, certain skincare for golden-hour mornings.'] },
    logos: [{ url: 'https://solsticeskin.com/logo.svg' }],
    productImages: [],
    confidence: 0.72,
    source: { kind: 'url', url: 'https://solsticeskin.com' },
  },
  review: false,
};

const LOW_CONF_FIXTURE = {
  ok: true,
  snapshot: {
    palette: [{ hex: '#0f1013' }],
    typography: [],
    voice: { samples: [] },
    logos: [],
    productImages: [],
    confidence: 0.3,
    source: { kind: 'url', url: 'https://thin.example.com' },
  },
  review: true,
};

test.describe('D1 — brand auto-ingest', () => {
  test('pasting a URL renders palette chips + voice sample and updates the rail', async ({
    page,
  }) => {
    await page.route('**/api/brand-ingest', async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.kind).toBe('url');
      expect(body.source).toBe('https://solsticeskin.com');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SNAPSHOT_FIXTURE),
      });
    });

    await page.goto('/workspace/demo-ws');

    const brandTrigger = page.locator('[data-rail-section="brand"]');
    await brandTrigger.click();

    const flyout = page.locator('[data-rail-flyout="brand"]');
    await expect(flyout).toBeVisible();

    const input = flyout.getByLabel('brand source');
    await input.fill('https://solsticeskin.com');
    await flyout.getByRole('button', { name: /ingest/i }).click();

    await expect(flyout.locator('[data-testid="brand-palette-chip"]')).toHaveCount(3);
    await expect(
      flyout.getByText('“Slow, certain skincare for golden-hour mornings.”')
    ).toBeVisible();
    await expect(flyout.locator('[data-testid="brand-review-banner"]')).toHaveCount(0);
  });

  test('bare-domain brand source enables ingest and normalizes to https', async ({
    page,
  }) => {
    await page.route('**/api/brand-ingest', async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.kind).toBe('url');
      expect(body.source).toBe('https://tong.berlayar.ai');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...SNAPSHOT_FIXTURE,
          snapshot: {
            ...SNAPSHOT_FIXTURE.snapshot,
            voice: { samples: ['Tong — Learn CJK by living in them'] },
            source: { kind: 'url', url: 'https://tong.berlayar.ai' },
          },
        }),
      });
    });

    await page.goto('/workspace/demo-ws');
    await page.locator('[data-rail-section="brand"]').click();

    const flyout = page.locator('[data-rail-flyout="brand"]');
    await expect(flyout).toBeVisible();
    await flyout.getByLabel('brand source').fill('tong.berlayar.ai');
    await expect(flyout.getByRole('button', { name: /ingest/i })).toBeEnabled();
    await flyout.getByRole('button', { name: /ingest/i }).click();

    await expect(
      flyout.getByText('“Tong — Learn CJK by living in them”')
    ).toBeVisible();
  });

  test('low-confidence ingests surface a review banner instead of silently overwriting', async ({
    page,
  }) => {
    await page.route('**/api/brand-ingest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LOW_CONF_FIXTURE),
      });
    });

    await page.goto('/workspace/demo-ws');
    await page.locator('[data-rail-section="brand"]').click();
    const flyout = page.locator('[data-rail-flyout="brand"]');

    await flyout.getByLabel('brand source').fill('https://thin.example.com');
    await flyout.getByRole('button', { name: /ingest/i }).click();

    await expect(flyout.locator('[data-testid="brand-review-banner"]')).toBeVisible();
    await expect(flyout.locator('[data-testid="brand-review-banner"]')).toContainText(
      /review before applying/i
    );
  });
});
