import { expect, test } from '@playwright/test';

const SNAPSHOT_FIXTURE = {
  ok: true,
  snapshot: {
    name: 'Spring Reset Duo',
    tagline: 'Barrier repair plus golden-hour glow.',
    claims: ['Ceramide cleanse', 'Niacinamide glow', 'Fragrance-free'],
    priceTiers: [{ label: 'Solo', price: '$29', period: 'mo' }],
    launchWindow: { startAt: '2026-04-30' },
    proof: ['Changed my morning routine.'],
    heroImages: [{ url: 'https://cdn.example.com/duo.jpg', alt: 'amber duo' }],
    confidence: 0.72,
    source: { kind: 'url', url: 'https://solsticeskin.com/duo' },
  },
  review: false,
};

const LOW_CONF_FIXTURE = {
  ok: true,
  snapshot: {
    name: 'Spring Reset Duo',
    claims: ['Ceramide cleanse'],
    heroImages: [],
    confidence: 0.3,
    source: { kind: 'url', url: 'https://thin.example.com' },
  },
  review: true,
};

test.describe('D2 — offer auto-ingest', () => {
  test('pasting a URL renders offer name, claim chips, tagline, and launch window', async ({
    page,
  }) => {
    await page.route('**/api/offer-ingest', async (route) => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.kind).toBe('url');
      expect(body.source).toBe('https://solsticeskin.com/duo');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SNAPSHOT_FIXTURE),
      });
    });

    await page.goto('/workspace/demo-ws');

    const offerTrigger = page.locator('[data-rail-section="offer"]');
    await offerTrigger.click();

    const flyout = page.locator('[data-rail-flyout="offer"]');
    await expect(flyout).toBeVisible();

    const input = flyout.getByLabel('offer source');
    await input.fill('https://solsticeskin.com/duo');
    await flyout.getByRole('button', { name: /ingest/i }).click();

    await expect(flyout.getByText('Spring Reset Duo')).toBeVisible();
    await expect(flyout.getByLabel('claim 1')).toHaveValue('Ceramide cleanse');
    await expect(flyout.getByLabel('claim 2')).toHaveValue('Niacinamide glow');
    await expect(flyout.getByLabel('claim 3')).toHaveValue('Fragrance-free');
    await expect(flyout.getByText(/2026-04-30/)).toBeVisible();
    await expect(flyout.locator('[data-testid="offer-review-banner"]')).toHaveCount(0);
  });

  test('low-confidence ingests surface a review banner instead of silently overwriting', async ({
    page,
  }) => {
    await page.route('**/api/offer-ingest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LOW_CONF_FIXTURE),
      });
    });

    await page.goto('/workspace/demo-ws');
    await page.locator('[data-rail-section="offer"]').click();
    const flyout = page.locator('[data-rail-flyout="offer"]');

    await flyout.getByLabel('offer source').fill('https://thin.example.com');
    await flyout.getByRole('button', { name: /ingest/i }).click();

    await expect(flyout.locator('[data-testid="offer-review-banner"]')).toBeVisible();
    await expect(flyout.locator('[data-testid="offer-review-banner"]')).toContainText(
      /review before applying/i
    );
  });
});
