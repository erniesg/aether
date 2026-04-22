import { expect, test, type Page } from '@playwright/test';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const SEG_PROVIDERS = [
  {
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    models: ['sam3.1'],
    supportsTextPrompt: true,
    supportsPointPrompt: true,
    supportsBoxPrompt: true,
    available: true,
  },
  {
    id: 'sam2',
    displayName: 'SAM 2 via Replicate',
    models: ['meta/sam-2'],
    supportsTextPrompt: false,
    supportsPointPrompt: false,
    supportsBoxPrompt: false,
    available: false,
    unavailableReason: 'Replicate SAM 2 is not connected',
  },
];

function generateSse(): string {
  const provider = { id: 'mock', displayName: 'mock', model: 'mock-model' };
  const events: Array<Record<string, unknown>> = [
    { type: 'run.started', at: 1, mode: 'single', frames: { total: 1 } },
    {
      type: 'plan.ready',
      at: 2,
      plannerMode: 'bypass',
      rewrittenPrompt: 'a still life',
      aspectRatio: '1:1',
      provider,
    },
    {
      type: 'frame.started',
      at: 3,
      frame: { id: 'canvas', label: 'Canvas', index: 1, total: 1, aspectRatio: '1:1' },
      provider,
    },
    {
      type: 'frame.completed',
      at: 4,
      frame: { id: 'canvas', label: 'Canvas', index: 1, total: 1, aspectRatio: '1:1' },
      provider,
      latencyMs: 10,
      image: { url: TINY_PNG, width: 1, height: 1, mimeType: 'image/png' },
    },
    {
      type: 'run.completed',
      at: 5,
      status: 'ok',
      frames: { total: 1, completed: 1, failed: 0 },
      provider,
      rewrittenPrompt: 'a still life',
      aspectRatio: '1:1',
      firstImageUrl: TINY_PNG,
      elapsedMs: 10,
    },
  ];
  return events.map((e) => `event: generate\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function segmentSse(runId: string): string {
  const provider = { id: 'sam3', displayName: 'SAM 3 via Modal', model: 'sam3.1' };
  const events = [
    {
      type: 'segment.started',
      at: 1,
      runId,
      provider,
      mode: 'prompt',
      verb: 'removebg',
    },
    { type: 'segment.progress', at: 2, runId, phase: 'inference' },
    { type: 'segment.progress', at: 3, runId, phase: 'postprocess' },
    {
      type: 'segment.completed',
      at: 4,
      runId,
      provider,
      latencyMs: 120,
      outputs: { maskUrl: TINY_PNG, cutoutUrl: TINY_PNG },
      preview: {
        sourceDataUrl: TINY_PNG,
        maskDataUrl: TINY_PNG,
        cutoutDataUrl: TINY_PNG,
        width: 1,
        height: 1,
      },
    },
  ];
  return events.map((e) => `event: segment\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

async function mockSegmentation(page: Page): Promise<Array<Record<string, unknown>>> {
  const postBodies: Array<Record<string, unknown>> = [];

  await page.route('**/api/segment', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, providers: SEG_PROVIDERS }),
      });
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    postBodies.push(body);
    const runId = typeof body.runId === 'string' ? body.runId : 'seg_default';
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: segmentSse(runId),
    });
  });

  return postBodies;
}

async function mockGenerate(page: Page): Promise<void> {
  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: generateSse(),
    });
  });
}

test.describe('B5 — segmentation SSE', () => {
  test('remove-bg streams phases from /api/segment and lands a placed preview', async ({
    page,
  }) => {
    await mockGenerate(page);
    const segmentRequests = await mockSegmentation(page);

    await page.goto('/workspace/demo-ws?provider=openai&bypass=1');

    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({ timeout: 30_000 });
    await page.waitForSelector('.tl-container, .tl-canvas', { timeout: 30_000 });

    // 1. drop an image on the canvas so SelectedImageActions can appear
    const composer = page.getByRole('textbox');
    await composer.fill('a still life');
    await composer.press('Shift+Enter');

    await expect
      .poll(async () => page.locator('.tl-container img').count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // 2. select the image — tldraw exposes the editor via window.editor on the
    // workspace shell; fall back to pressing Ctrl+A which also selects all
    // shapes (our only shape is the placed image at this point).
    await page.locator('.tl-container').click({ position: { x: 400, y: 300 } });
    await page.keyboard.press('Control+A');

    // 3. the selected-image action bar appears once the editor reports a
    // single image selection. Clicking "remove bg" opens the segmentation
    // panel and immediately kicks off a preview run.
    const removeBg = page.getByRole('button', { name: /remove bg/i }).first();
    await expect(removeBg).toBeVisible({ timeout: 10_000 });
    await removeBg.click();

    // 4. the POST call is SSE-bound and includes a runId the client generated.
    await expect.poll(() => segmentRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const [body] = segmentRequests;
    expect(body.mode).toBe('removebg');
    expect(typeof body.runId).toBe('string');

    // 5. activity feed surfaces the streamed phases via the right-rail
    // generations flyout (all runs, regardless of tool, land in ActionLog).
    const generations = page.locator('[data-rail-section="all-generations"]');
    await expect(generations).toBeVisible({ timeout: 10_000 });
    await generations.click();
    const flyout = page.locator('[data-rail-flyout="all-generations"]');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator(`img[src="${TINY_PNG}"]`).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('segment GET returns JSON provider status even when POST is SSE', async ({
    page,
  }) => {
    await mockSegmentation(page);

    const response = await page.request.get('/api/segment');
    expect(response.headers()['content-type']).toContain('application/json');
    const json = (await response.json()) as { ok: boolean; providers: Array<{ id: string }> };
    expect(json.ok).toBe(true);
    expect(json.providers.map((p) => p.id).sort()).toEqual(['sam2', 'sam3']);
  });
});
