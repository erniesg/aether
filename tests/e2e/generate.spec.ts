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
  test('⇧+Enter keeps the generation scoped to one artboard', async ({
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
    await composer.press('Shift+Enter');

    // ComposerStatus flips to "placed on canvas".
    await expect(page.getByText(/placed on canvas/)).toBeVisible({
      timeout: 10_000,
    });

    // Single-scope submit produces one run, even though the sticky default is
    // "apply to all".
    const generationsSection = page.locator('[data-rail-section="all-generations"]');
    await expect(generationsSection).toHaveAttribute('aria-label', /1 run\b/);

    // And the tldraw image shape count should have incremented.
    await expect
      .poll(async () => page.locator('.tl-container img').count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(initialImages);

    // Open the rail to reveal the ActionLog — the newly-placed run should
    // be listed with its image thumb visible.
    await generationsSection.click();
    const flyout = page.locator('[data-rail-flyout="all-generations"]');
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

    // Next.js injects its own `role="alert"` route announcer, so filter to
    // the ComposerStatus alert by the error text it renders.
    await expect(
      page.getByRole('alert').filter({ hasText: /upstream boom/ })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('scope=all rewrites once, then fans out one bypassed render per artboard', async ({
    page,
  }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route('**/api/generate', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requests.push(body);

      if (body.planOnly === true) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            plan: {
              rewrittenPrompt: 'shared editorial still life, warm bounce, oat backdrop',
              aspectRatio: '1:1',
              rationale: 'fan-out test fixture',
            },
            provider: {
              id: 'openai',
              displayName: 'OpenAI Images',
              model: 'gpt-image-1',
            },
          }),
        });
        return;
      }

      const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio : '1:1';
      const dims =
        aspectRatio === '4:5'
          ? { width: 1024, height: 1280 }
          : aspectRatio === '9:16'
          ? { width: 1024, height: 1792 }
          : aspectRatio === '16:9'
          ? { width: 1792, height: 1024 }
          : { width: 1024, height: 1024 };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          plan: {
            rewrittenPrompt: 'shared editorial still life, warm bounce, oat backdrop',
            aspectRatio,
            rationale: 'fan-out test fixture',
          },
          provider: {
            id: 'openai',
            displayName: 'OpenAI Images',
            model: 'gpt-image-1',
          },
          result: {
            latencyMs: 42,
            images: [
              {
                url: TINY_PNG,
                width: dims.width,
                height: dims.height,
                mimeType: 'image/png',
              },
            ],
          },
        }),
      });
    });

    await page.goto('/workspace/demo-ws');
    await expect(page.locator('.tl-container')).toBeVisible();
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    const composer = page.getByPlaceholder('describe the generation…');
    await composer.fill('build me a cross-format campaign visual');
    await composer.press('Enter');

    await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(5);

    const planRequests = requests.filter((r) => r.planOnly === true);
    expect(planRequests).toHaveLength(1);
    expect(planRequests[0]?.bypassAgent).toBe(false);

    const imageRequests = requests.filter((r) => r.planOnly !== true);
    expect(imageRequests).toHaveLength(4);
    expect(imageRequests.every((r) => r.bypassAgent === true)).toBe(true);
    expect(imageRequests.every((r) => r.prompt === 'shared editorial still life, warm bounce, oat backdrop')).toBe(true);
    expect(imageRequests.every((r) => r.providerId === 'openai')).toBe(true);
    expect(imageRequests.every((r) => r.model === 'gpt-image-1')).toBe(true);
    expect(
      imageRequests
        .map((r) => r.aspectRatio)
        .sort()
    ).toEqual(['16:9', '4:5', '9:16', '9:16']);

    await expect(page.getByText(/placed on canvas/)).toBeVisible({
      timeout: 10_000,
    });

    const generationsSection = page.locator('[data-rail-section="all-generations"]');
    await expect(generationsSection).toHaveAttribute('aria-label', /4 runs\b/);
    await generationsSection.click();

    const flyout = page.locator('[data-rail-flyout="all-generations"]');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('ol > li')).toHaveCount(4);
    await expect(flyout.locator(`img[src="${TINY_PNG}"]`)).toHaveCount(4);
  });
});
