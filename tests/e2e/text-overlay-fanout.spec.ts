import { expect, test, type Page } from '@playwright/test';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const HEADLINE_BY_LOCALE: Record<string, string> = {
  en: 'Slow morning, golden hour',
  'zh-Hans': '慢早晨，黄金时刻',
  'ja-JP': 'ゆっくりとした朝',
};

const SUBHEAD_BY_LOCALE: Record<string, string> = {
  en: 'Spring Reset Duo · barrier repair',
  'zh-Hans': '春日修复套装 · 屏障修复',
  'ja-JP': 'スプリング・リセット',
};

function buildGenerateStream(input: {
  prompt: string;
  frames: Array<{ id: string; label?: string; aspectRatio: string }>;
}): string {
  const provider = {
    id: 'openai',
    displayName: 'OpenAI Images',
    model: 'gpt-image-1',
  };

  const events: Array<Record<string, unknown>> = [
    {
      type: 'run.started',
      at: 1,
      mode: input.frames.length > 1 ? 'fanout' : 'single',
      frames: { total: input.frames.length },
    },
    {
      type: 'plan.ready',
      at: 3,
      plannerMode: 'bypass',
      rewrittenPrompt: input.prompt,
      aspectRatio: input.frames[0]?.aspectRatio ?? '1:1',
      provider,
    },
  ];

  input.frames.forEach((frame, index) => {
    events.push({
      type: 'frame.started',
      at: 4 + index * 2,
      frame: { ...frame, index: index + 1, total: input.frames.length },
      provider,
    });
    events.push({
      type: 'frame.completed',
      at: 5 + index * 2,
      frame: { ...frame, index: index + 1, total: input.frames.length },
      provider,
      latencyMs: 42,
      image: {
        url: TINY_PNG,
        width: frame.aspectRatio === '16:9' ? 1792 : 1024,
        height:
          frame.aspectRatio === '4:5'
            ? 1280
            : frame.aspectRatio === '9:16'
              ? 1792
              : 1024,
        mimeType: 'image/png',
      },
    });
  });

  events.push({
    type: 'run.completed',
    at: 100,
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
  });

  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

interface ApplyRequest {
  artboardId?: string;
  sourceLocale?: string;
  targetLocales?: string[];
}

async function mockTextOverlayApply(
  page: Page,
  collected: ApplyRequest[]
): Promise<void> {
  await page.route('**/api/text-overlay/apply', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    collected.push({
      artboardId: body.artboardId as string,
      sourceLocale: body.sourceLocale as string,
      targetLocales: body.targetLocales as string[],
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        plannerMode: 'fallback',
        rationale: 'mocked',
        layers: [
          {
            zone: {
              purpose: 'headline',
              bbox: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
            },
            content: HEADLINE_BY_LOCALE,
            textAlign: 'center',
          },
          {
            zone: {
              purpose: 'subhead',
              bbox: { x: 0.12, y: 0.76, w: 0.76, h: 0.08 },
            },
            content: SUBHEAD_BY_LOCALE,
            textAlign: 'center',
          },
        ],
        provenance: {
          sourceLocale: body.sourceLocale,
          targetLocales: body.targetLocales,
          wsId: body.wsId,
          artboardId: body.artboardId,
        },
      }),
    });
  });
}

async function mockGenerateFanout(page: Page): Promise<void> {
  await page.route('**/api/generate', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const targets = (body.targets as Array<{ id: string; label?: string; aspectRatio: string }>) ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: buildGenerateStream({
        prompt: 'shared editorial still life',
        frames: targets,
      }),
    });
  });
}

test.describe('Track C — multilingual text overlays on canvas', () => {
  test('fanout drops one image + editable text shapes per artboard, locale switch repaints', async ({
    page,
  }) => {
    const applyRequests: ApplyRequest[] = [];
    await mockGenerateFanout(page);
    await mockTextOverlayApply(page, applyRequests);

    await page.goto('/workspace/demo-ws?provider=openai&model=gpt-image-1&bypass=1');
    await expect(page.locator('.tl-container')).toBeVisible();
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    const composer = page.getByPlaceholder('describe the generation…');
    await composer.fill('build me a cross-format campaign visual');
    await composer.press('Enter');

    // Wait for the four fan-out frames to land + the apply call to fire per
    // artboard (4 artboards × 1 apply call each = 4 requests).
    await expect(page.getByText(/placed 4\/4 formats/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => applyRequests.length, { timeout: 10_000 }).toBe(4);

    // Each apply call uses the active locale (en by default) as source and
    // ships the other two demo locales as targets.
    for (const req of applyRequests) {
      expect(req.sourceLocale).toBe('en');
      expect(req.targetLocales).toEqual(expect.arrayContaining(['zh-Hans', 'ja-JP']));
    }

    // Shapes are inserted with a stable testid pattern. Two layers per
    // artboard × four artboards = eight shapes.
    await expect
      .poll(
        async () =>
          page.locator('[data-testid^="aether-text-shape-"]').count(),
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(8);

    // The default locale (en) renders the English headline.
    await expect(page.locator('text=Slow morning, golden hour').first()).toBeVisible({
      timeout: 10_000,
    });

    // Switch to zh-Hans via the right-rail focus flyout.
    await page.locator('[data-rail-section="focus"]').click();
    await page.getByTestId('locale-switch-zh-Hans').click();
    await expect(page.getByTestId('locale-switch-zh-Hans')).toHaveAttribute(
      'data-active',
      'true'
    );

    // The text shapes repaint with the Chinese headline.
    await expect(page.locator('text=慢早晨，黄金时刻').first()).toBeVisible({
      timeout: 5_000,
    });

    // And then ja-JP.
    await page.getByTestId('locale-switch-ja-JP').click();
    await expect(page.locator('text=ゆっくりとした朝').first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
