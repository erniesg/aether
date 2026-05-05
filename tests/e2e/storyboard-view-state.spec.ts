import { expect, test, type Page } from '@playwright/test';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const COMMAND_TRANSCRIPT =
  'Generate a campaign for the big sleeping part in different formats and languages and auto publish to Twitter only.';

const LOCALES = ['en-SG', 'zh-Hans-SG', 'ms-SG', 'ta-SG', 'ja-JP', 'ko-KR'];

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function buildGenerateStream(input: {
  prompt: string;
  frames: Array<{ id: string; label?: string; aspectRatio: string }>;
}): string {
  const provider = {
    id: 'replicate',
    displayName: 'Replicate',
    model: 'openai/gpt-image-2',
  };
  const events: Array<Record<string, unknown>> = [
    {
      type: 'run.started',
      at: 1,
      mode: 'hero-seeded-fanout',
      frames: { total: input.frames.length },
    },
    {
      type: 'plan.ready',
      at: 2,
      plannerMode: 'bypass',
      rewrittenPrompt: input.prompt,
      aspectRatio: input.frames[0]?.aspectRatio ?? '1:1',
      provider,
    },
  ];

  input.frames.forEach((frame, index) => {
    events.push({
      type: 'frame.started',
      at: 3 + index * 2,
      frame: { ...frame, index: index + 1, total: input.frames.length },
      provider,
    });
    events.push({
      type: 'frame.completed',
      at: 4 + index * 2,
      frame: { ...frame, index: index + 1, total: input.frames.length },
      provider,
      latencyMs: 44,
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
    mode: 'hero-seeded-fanout',
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

  return toSse(events);
}

async function installBrowserVoiceShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeMediaRecorder extends EventTarget {
      stream: MediaStream;

      constructor(stream: MediaStream) {
        super();
        this.stream = stream;
      }

      start() {}

      stop() {
        window.setTimeout(() => {
          const data = new Event('dataavailable');
          Object.defineProperty(data, 'data', {
            value: new Blob(['voice'], { type: 'audio/webm' }),
          });
          this.dispatchEvent(data);
          this.dispatchEvent(new Event('stop'));
        }, 0);
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      },
    });
  });
}

async function installVoiceRoutes(
  page: Page,
  generateRequests: Array<Record<string, unknown>>
): Promise<void> {
  await page.route('**/api/voice/transcribe', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        transcript: COMMAND_TRANSCRIPT,
        provider: {
          id: 'local-whisper',
          model: 'mlx-community/whisper-small-mlx',
        },
      }),
    });
  });

  await page.route('**/api/voice/command', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        command: {
          action: 'generate-socials',
          transcript: COMMAND_TRANSCRIPT,
          brief: 'Eight Sleep Pod campaign',
          prompt: 'Generate multilingual social creative for Eight Sleep Pod.',
          scope: 'all',
          referenceSearchQuery: 'Eight Sleep Pod product lifestyle',
          publishMode: 'auto-post',
          targetPlatforms: ['x'],
          needsPublishClarification: false,
          confidence: 0.84,
          source: 'heuristic',
          product: {
            id: 'eight-sleep-pod',
            canonicalName: 'Eight Sleep Pod',
            source: 'catalog',
            confidence: 0.86,
          },
        },
      }),
    });
  });

  await page.route('**/api/voice/references', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: 'ok',
        references: [{ url: TINY_PNG, score: 0.92 }],
        records: [
          {
            id: 'ref-eight-sleep-pod',
            kind: 'image',
            title: 'Eight Sleep Pod hero reference',
            previewUrl: TINY_PNG,
            fullUrl: TINY_PNG,
            productId: 'eight-sleep-pod',
            productCanonicalName: 'Eight Sleep Pod',
            referenceStatus: 'candidate',
            capturedAt: '2026-05-05T00:00:00.000Z',
            attribution: { source: 'image-search', url: TINY_PNG },
          },
        ],
      }),
    });
  });

  await page.route('**/api/text-overlay/apply', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        plannerMode: 'fallback',
        rationale: 'mocked multilingual overlays',
        layers: [
          {
            zone: {
              purpose: 'headline',
              bbox: { x: 0.08, y: 0.62, w: 0.84, h: 0.12 },
            },
            content: Object.fromEntries(
              LOCALES.map((locale) => [locale, `Sleep cooler tonight · ${locale}`])
            ),
            textAlign: 'center',
          },
          {
            zone: {
              purpose: 'subhead',
              bbox: { x: 0.12, y: 0.76, w: 0.76, h: 0.08 },
            },
            content: Object.fromEntries(
              LOCALES.map((locale) => [locale, `Eight Sleep Pod · ${locale}`])
            ),
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

  await page.route('**/api/generate', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    generateRequests.push(body);
    const frames = (body.targets as Array<{
      id: string;
      label?: string;
      aspectRatio: string;
    }>) ?? [{ id: 'canvas', label: 'Canvas', aspectRatio: '1:1' }];
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: buildGenerateStream({
        prompt: String(body.prompt ?? 'Eight Sleep Pod campaign'),
        frames,
      }),
    });
  });
}

test.describe('storyboard lens state preservation', () => {
  test('voice review, generation frames, locales, and publish state survive canvas/storyboard toggles', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const generateRequests: Array<Record<string, unknown>> = [];
    await installBrowserVoiceShim(page);
    await installVoiceRoutes(page, generateRequests);

    await page.goto('/workspace/demo-ws?provider=replicate&model=openai/gpt-image-2&bypass=1');
    await expect(page.locator('.tl-container')).toBeVisible();
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    const voiceButton = page
      .getByTestId('composer-voice-slot')
      .locator('button[data-async-voice-state]');
    await voiceButton.dispatchEvent('pointerdown');
    await expect(voiceButton).toHaveAttribute(
      'data-async-voice-state',
      'listening'
    );
    await voiceButton.dispatchEvent('pointerup');

    await expect(page.getByTestId('async-voice-review-ready')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('view-switch-storyboard').click();
    await expect(page.getByTestId('storyboard-lens')).toBeVisible();
    await expect(page.getByTestId('async-voice-review-ready')).toBeVisible();

    await page.getByTestId('view-switch-canvas').click();
    await expect(page.getByTestId('async-voice-review-ready')).toBeVisible();
    await page.getByRole('button', { name: /keep reference/i }).click();
    await page.getByRole('button', { name: /use selected/i }).click();

    await expect.poll(() => generateRequests.length, { timeout: 10_000 }).toBe(1);
    expect(generateRequests[0]).toMatchObject({
      providerId: 'replicate',
      model: 'openai/gpt-image-2',
      notifyMode: 'auto-post',
      targetPlatforms: ['x'],
      mode: 'hero-seeded-fanout',
    });

    await page.getByTestId('view-switch-storyboard').click();
    await expect(page.getByTestId('storyboard-run').first()).toHaveAttribute(
      'data-run-status',
      'running',
      { timeout: 10_000 }
    );

    await expect(page.getByText(/placed 4\/4 formats/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(async () => page.getByTestId('storyboard-run-frame').count(), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(4);
    await expect
      .poll(async () => page.getByTestId('storyboard-locale-chip').count(), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(6);

    await page.getByTestId('view-switch-canvas').click();
    await page
      .getByTestId('composer-voice-slot')
      .getByRole('button', { name: /show voice command details/i })
      .click();
    await expect(page.locator('[data-async-voice-history]')).toHaveCount(0);
    await page.locator('[data-rail-section="scheduled"]').click();
    const publishFlyout = page.locator('[data-rail-flyout="scheduled"]');
    await expect(publishFlyout).toBeVisible();
    await publishFlyout.getByTestId('publish-platform-en-SG-instagram').click();
    await publishFlyout.getByTestId('publish-platform-en-SG-x').click();
    await publishFlyout
      .getByTestId('publish-caption-en-SG')
      .fill('Sleep cooler tonight with Eight Sleep Pod.');
    await publishFlyout.getByTestId('publish-schedule-submit').click();

    const overlay = page.getByTestId('publish-preview-overlay');
    await expect(overlay).toBeVisible();
    await overlay.getByTestId('publish-preview-close').click();

    await page.getByTestId('view-switch-storyboard').click();
    await expect(page.getByTestId('storyboard-publish-post')).toHaveAttribute(
      'data-platform',
      'x'
    );
    await expect(page.getByTestId('storyboard-reference')).toHaveCount(1);

    await page.screenshot({
      path: testInfo.outputPath('storyboard-state-preserved.png'),
      fullPage: true,
    });
  });
});
