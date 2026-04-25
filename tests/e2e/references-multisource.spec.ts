import { expect, test } from '@playwright/test';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

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

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function buildGenerateStream(targets: Array<{ id: string; label?: string; aspectRatio?: string }>): string {
  const frames =
    targets.length > 0
      ? targets.map((target) => ({
          id: target.id,
          label: target.label,
          aspectRatio: target.aspectRatio ?? '4:5',
        }))
      : [{ id: 'canvas', label: 'Canvas', aspectRatio: '4:5' }];
  const provider = { id: 'openai', displayName: 'OpenAI Images', model: 'gpt-image-1' };

  return toSse([
    {
      type: 'run.started',
      at: 1,
      mode: frames.length > 1 ? 'fanout' : 'single',
      frames: { total: frames.length },
    },
    {
      type: 'plan.ready',
      at: 2,
      plannerMode: 'bypass',
      rewrittenPrompt: 'reference-only generation',
      aspectRatio: frames[0]?.aspectRatio ?? '4:5',
      provider,
    },
    ...frames.flatMap((frame, index) => [
      {
        type: 'frame.started',
        at: 3 + index * 2,
        frame: {
          id: frame.id,
          label: frame.label,
          index: index + 1,
          total: frames.length,
          aspectRatio: frame.aspectRatio,
        },
        provider,
      },
      {
        type: 'frame.completed',
        at: 4 + index * 2,
        frame: {
          id: frame.id,
          label: frame.label,
          index: index + 1,
          total: frames.length,
          aspectRatio: frame.aspectRatio,
        },
        provider,
        latencyMs: 32,
        image: {
          url: `https://cdn.test/generated-reference-${index + 1}.png`,
          width: frame.aspectRatio === '16:9' ? 1200 : 1080,
          height: frame.aspectRatio === '9:16' ? 1920 : 1350,
          mimeType: 'image/png',
        },
      },
    ]),
    {
      type: 'run.completed',
      at: 99,
      status: 'ok',
      frames: { total: frames.length, completed: frames.length, failed: 0 },
      provider,
      rewrittenPrompt: 'reference-only generation',
      aspectRatio: frames[0]?.aspectRatio ?? '4:5',
      firstImageUrl: 'https://cdn.test/generated-reference-1.png',
      elapsedMs: 128,
    },
  ]);
}

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
    // locator('img') targets the HTML <img> tag specifically; the chip also
    // contains a lucide <X> SVG remove-icon which getByRole('img') picks up
    // and triggers a strict-mode violation.
    await expect(chip.locator('img')).toHaveAttribute(
      'src',
      PINTEREST_RECORD.previewUrl
    );
  });

  test('dragging a pinned reference chip attaches it to the composer', async ({
    page,
  }) => {
    await page.route('**/api/reference-ingest', async (route) => {
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

    await flyout.getByLabel('reference source').fill('https://www.pinterest.com/pin/123456789/');
    await flyout.getByRole('button', { name: /^ingest$/i }).click();

    const chip = flyout.locator('[data-testid="reference-chip"]').first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('draggable', 'true');

    const dragResult = await page.evaluate(() => {
      const chipEl = document.querySelector('[data-testid="reference-chip"]');
      const composerEl = document.querySelector('form[data-taxonomy="tool"]');
      if (!chipEl || !composerEl) return { ok: false, reason: 'missing elements' };

      const dataTransfer = new DataTransfer();
      chipEl.dispatchEvent(
        new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        })
      );
      for (const type of ['dragenter', 'dragover', 'drop']) {
        composerEl.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          })
        );
      }
      return {
        ok: true,
        types: Array.from(dataTransfer.types),
        text: dataTransfer.getData('text/plain'),
        reference: dataTransfer.getData('application/x-aether-reference'),
      };
    });

    expect(dragResult).toMatchObject({
      ok: true,
      text: PINTEREST_RECORD.fullUrl,
    });
    expect(dragResult.types).toContain('application/x-aether-reference');
    expect(dragResult.reference).toContain(PINTEREST_RECORD.previewUrl);

    const composer = page.locator('form[data-taxonomy="tool"]');
    await expect(composer.locator('img[alt="reference 1"]')).toHaveAttribute(
      'src',
      PINTEREST_RECORD.previewUrl
    );
    await expect(
      composer.getByRole('button', {
        name: 'input set · 1 ad-hoc reference image attached',
      })
    ).toBeVisible();
  });

  test('dropping an image file on the bottom composer attaches it and enables generate', async ({
    page,
  }) => {
    const generateRequests: Array<Record<string, unknown>> = [];
    await page.route('https://cdn.test/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(PNG_BASE64, 'base64'),
      });
    });
    await page.route('**/api/generate', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      generateRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: buildGenerateStream(
          (body.targets as Array<{ id: string; label?: string; aspectRatio?: string }>) ?? []
        ),
      });
    });

    await page.goto('/workspace/demo-ws?provider=openai&model=gpt-image-1&bypass=1');

    const composer = page.locator('form[data-taxonomy="tool"]');
    await expect(composer).toBeVisible();

    const dropResult = await page.evaluate((pngBase64) => {
      const composerEl = document.querySelector('form[data-taxonomy="tool"]');
      if (!composerEl) return { ok: false, reason: 'missing composer' };

      const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([bytes], 'reference.png'));

      for (const type of ['dragenter', 'dragover', 'drop']) {
        composerEl.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          })
        );
      }

      return {
        ok: true,
        types: Array.from(dataTransfer.types),
        files: dataTransfer.files.length,
      };
    }, PNG_BASE64);

    expect(dropResult).toMatchObject({ ok: true, files: 1 });
    expect(dropResult.types).toContain('Files');

    await expect(composer.locator('img[alt="reference 1"]')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/
    );
    await expect(
      composer.getByRole('button', {
        name: 'input set · 1 ad-hoc reference image attached',
      })
    ).toBeVisible();
    const generateButton = composer.getByRole('button', { name: 'generate from reference' });
    await expect(generateButton).toBeEnabled();

    await generateButton.click();
    await expect.poll(() => generateRequests.length, { timeout: 10_000 }).toBe(1);
    const [request] = generateRequests;
    expect(String(request.prompt)).toContain(
      'Create a canvas-ready visual from the attached reference image.'
    );
    const refs = request.refs as Array<{ url?: string }>;
    expect(refs).toHaveLength(1);
    expect(refs[0]?.url).toMatch(/^data:image\/png;base64,/);
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
