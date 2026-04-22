import { expect, test, type Page } from '@playwright/test';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function buildGenerateStream(input: {
  prompt: string;
  providerId?: string;
  model?: string;
  plannerMode?: 'anthropic' | 'bypass' | 'fallback';
  frames: Array<{ id: string; label?: string; aspectRatio: string }>;
}): string {
  const provider = {
    id: input.providerId ?? 'openai',
    displayName: 'OpenAI Images',
    model: input.model ?? 'gpt-image-1',
  };

  return toSse([
    {
      type: 'run.started',
      at: 1,
      mode: input.frames.length > 1 ? 'fanout' : 'single',
      frames: { total: input.frames.length },
    },
    ...(input.plannerMode === 'anthropic'
      ? [{ type: 'planner.started', at: 2, plannerModel: 'claude-opus-4-7' }]
      : []),
    {
      type: 'plan.ready',
      at: 3,
      plannerMode: input.plannerMode ?? 'bypass',
      plannerModel: input.plannerMode === 'anthropic' ? 'claude-opus-4-7' : undefined,
      rewrittenPrompt: input.prompt,
      aspectRatio: input.frames[0]?.aspectRatio ?? '1:1',
      provider,
      ...(input.plannerMode === 'anthropic'
        ? {
            toolCall: {
              name: 'generate_image',
              prompt: input.prompt,
              aspectRatio: input.frames[0]?.aspectRatio ?? '1:1',
            },
          }
        : {}),
    },
    ...input.frames.flatMap((frame, index) => [
      {
        type: 'frame.started',
        at: 4 + index * 2,
        frame: {
          id: frame.id,
          label: frame.label,
          index: index + 1,
          total: input.frames.length,
          aspectRatio: frame.aspectRatio,
        },
        provider,
      },
      {
        type: 'frame.completed',
        at: 5 + index * 2,
        frame: {
          id: frame.id,
          label: frame.label,
          index: index + 1,
          total: input.frames.length,
          aspectRatio: frame.aspectRatio,
        },
        provider,
        latencyMs: 42,
        image: {
          url: TINY_PNG,
          width: frame.aspectRatio === '16:9' ? 1792 : 1024,
          height: frame.aspectRatio === '4:5' ? 1280 : frame.aspectRatio === '9:16' ? 1792 : 1024,
          mimeType: 'image/png',
        },
      },
    ]),
    {
      type: 'run.completed',
      at: 20,
      status: 'ok',
      frames: {
        total: input.frames.length,
        completed: input.frames.length,
        failed: 0,
      },
      provider,
      rewrittenPrompt: input.prompt,
      aspectRatio: input.frames[0]?.aspectRatio ?? '1:1',
      firstImageUrl: TINY_PNG,
      elapsedMs: 4200,
    },
  ]);
}

async function mockGenerate(
  page: Page,
  status: number,
  body: string | Record<string, unknown>
): Promise<void> {
  await page.route('**/api/generate', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status,
      contentType:
        typeof body === 'string' ? 'text/event-stream; charset=utf-8' : 'application/json',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  });
}

test.describe('B2 — generate happy path', () => {
  test('⇧+Enter keeps the generation scoped to one artboard', async ({ page }) => {
    await mockGenerate(
      page,
      200,
      buildGenerateStream({
        prompt: 'a serene aether test image',
        plannerMode: 'bypass',
        frames: [{ id: 'canvas', label: 'Canvas', aspectRatio: '1:1' }],
      })
    );
    await page.goto('/workspace/demo-ws?provider=openai&bypass=1');

    const composer = page.getByPlaceholder('describe the generation…');
    await expect(composer).toBeVisible();
    await expect(page.locator('.tl-container')).toBeVisible();
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    const initialImages = await page.locator('.tl-container img').count();
    await expect(page.getByText(/idle · type a prompt/)).toBeVisible();

    await composer.fill('a serene aether test image');
    await composer.press('Shift+Enter');

    await expect(page.getByText(/placed on canvas/)).toBeVisible({ timeout: 10_000 });

    const generationsSection = page.locator('[data-rail-section="all-generations"]');
    await expect(generationsSection).toHaveAttribute('aria-label', /1 run\b/);

    await expect
      .poll(async () => page.locator('.tl-container img').count(), {
        timeout: 10_000,
      })
      .toBeGreaterThan(initialImages);

    await generationsSection.click();
    const flyout = page.locator('[data-rail-flyout="all-generations"]');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator(`img[src="${TINY_PNG}"]`)).toBeVisible();
  });

  test('API error surfaces as an error status in the composer', async ({ page }) => {
    await mockGenerate(page, 502, { ok: false, error: 'upstream boom' });
    await page.goto('/workspace/demo-ws');

    const composer = page.getByPlaceholder('describe the generation…');
    await expect(composer).toBeVisible();
    await composer.fill('boom');
    await composer.press('Enter');

    await expect(
      page.getByRole('alert').filter({ hasText: /upstream boom/ })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('scope=all streams one grouped fan-out run with per-format targets', async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route('**/api/generate', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requests.push(body);

      const targets = (body.targets as Array<{ id: string; label?: string; aspectRatio: string }>) ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: buildGenerateStream({
          prompt: 'shared editorial still life, warm bounce, oat backdrop',
          providerId: 'openai',
          model: 'gpt-image-1',
          plannerMode: 'bypass',
          frames: targets,
        }),
      });
    });

    await page.goto('/workspace/demo-ws?provider=openai&model=gpt-image-1&bypass=1');
    await expect(page.locator('.tl-container')).toBeVisible();
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    const composer = page.getByPlaceholder('describe the generation…');
    await composer.fill('build me a cross-format campaign visual');
    await composer.press('Enter');

    await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);

    const [request] = requests;
    expect(request?.bypassAgent).toBe(true);
    expect(request?.providerId).toBe('openai');
    expect(request?.model).toBe('gpt-image-1');
    expect(
      ((request?.targets as Array<{ aspectRatio: string }>) ?? [])
        .map((target) => target.aspectRatio)
        .sort()
    ).toEqual(['16:9', '4:5', '9:16', '9:16']);

    await expect(page.getByText(/placed 4\/4 formats/i)).toBeVisible({ timeout: 10_000 });

    const generationsSection = page.locator('[data-rail-section="all-generations"]');
    await expect(generationsSection).toHaveAttribute('aria-label', /1 run\b/);
    await generationsSection.click();

    const flyout = page.locator('[data-rail-flyout="all-generations"]');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator(`img[src="${TINY_PNG}"]`).first()).toBeVisible();

    await page.getByRole('button', { name: /show activity/i }).click();
    const formatsPanel = page.locator('section').filter({
      has: page.getByText(/^formats$/i),
    });
    await expect(formatsPanel).toBeVisible();
    await expect(formatsPanel.getByText('IG Post')).toBeVisible();
    await expect(formatsPanel.getByText('Story')).toBeVisible();
  });
});
