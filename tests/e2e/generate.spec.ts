import { expect, test, type Page } from '@playwright/test';

// 1x1 transparent PNG so tldraw has a renderable asset without leaving the
// test machine.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const HAPPY_FIXTURE = {
  ok: true,
  plan: {
    rewrittenPrompt: 'a serene aether test image',
    aspectRatio: '1:1',
    rationale: 'e2e fixture',
  },
  provider: { id: 'openai', displayName: 'OpenAI Images', model: 'gpt-image-1' },
  result: {
    latencyMs: 42,
    images: [
      {
        url: TINY_PNG,
        width: 1024,
        height: 1024,
        mimeType: 'image/png',
      },
    ],
  },
};

async function mockGenerate(
  page: Page,
  status: number,
  body: unknown
): Promise<void> {
  await page.route('**/api/generate', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.describe('B2 — generate happy path', () => {
  test('prompt → image on canvas → sync rail flips to "1 run"', async ({
    page,
  }) => {
    await mockGenerate(page, 200, HAPPY_FIXTURE);
    await page.goto('/workspace/demo-ws');

    const composer = page.getByPlaceholder('describe the generation…');
    await expect(composer).toBeVisible();
    await expect(page.locator('.tl-container')).toBeVisible();
    // Wait for tldraw's editor to fully mount — the canvas inner layer only
    // appears once `onMount` has fired, after which setEditor has captured the
    // Editor instance and dropImageOnCanvas becomes callable.
    await page.locator('.tl-container .tl-canvas, .tl-container .tl-svg-container').first().waitFor({ timeout: 15_000 });

    const initialImages = await page.locator('.tl-container img').count();

    // Initial state: idle status.
    await expect(page.getByText(/idle · type a prompt/)).toBeVisible();

    await composer.fill('a serene aether test image');
    await composer.press('Enter');

    // ComposerStatus flips to "placed on canvas".
    await expect(page.getByText(/placed on canvas/)).toBeVisible({
      timeout: 10_000,
    });

    // Right-rail sync · provenance summary should now read "1 run".
    const syncSection = page.locator('[data-rail-section="sync"]');
    await expect(syncSection).toHaveAttribute('aria-label', /1 run\b/);

    // And the tldraw image shape count should have incremented.
    await expect
      .poll(async () => page.locator('.tl-container img').count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(initialImages);

    // Open the sync rail to reveal the ActionLog — the newly-placed run
    // should be listed with its image thumb visible.
    await syncSection.click();
    const flyout = page.locator('[data-rail-flyout="sync"]');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator(`img[src="${TINY_PNG}"]`)).toBeVisible();
  });

  test('API error surfaces as an error status in the composer', async ({
    page,
  }) => {
    await mockGenerate(page, 502, { ok: false, error: 'upstream boom' });
    await page.goto('/workspace/demo-ws');

    const composer = page.getByPlaceholder('describe the generation…');
    await expect(composer).toBeVisible();
    await composer.fill('boom');
    await composer.press('Enter');

    await expect(page.getByRole('alert')).toContainText(/upstream boom/, {
      timeout: 10_000,
    });
  });
});
