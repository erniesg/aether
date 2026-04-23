import { expect, test, type Page, type Download } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

async function readDownloadBytes(download: Download): Promise<Buffer> {
  // `response.body()` is empty once the browser hands the response off to a
  // download — read the saved file instead. Playwright keeps it in a temp dir
  // until the test ends.
  const path = await download.path();
  if (!path) throw new Error('download had no path');
  return readFile(path);
}

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function buildFanoutStream(frames: Array<{ id: string; label?: string; aspectRatio: string }>): string {
  const provider = {
    id: 'openai',
    displayName: 'OpenAI Images',
    model: 'gpt-image-1',
  };

  return toSse([
    {
      type: 'run.started',
      at: 1,
      mode: 'fanout',
      frames: { total: frames.length },
    },
    {
      type: 'plan.ready',
      at: 2,
      plannerMode: 'bypass',
      rewrittenPrompt: 'export seed · neon hero fanout',
      aspectRatio: frames[0]?.aspectRatio ?? '1:1',
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
        latencyMs: 40,
        image: {
          url: TINY_PNG,
          width: 1024,
          height: 1024,
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
      rewrittenPrompt: 'export seed · neon hero fanout',
      aspectRatio: frames[0]?.aspectRatio ?? '1:1',
      firstImageUrl: TINY_PNG,
      elapsedMs: 120,
    },
  ]);
}

async function seedGeneratedRun(page: Page): Promise<void> {
  await page.route('**/api/generate', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const targets =
      (body.targets as Array<{ id: string; label?: string; aspectRatio: string }>) ?? [
        { id: 'canvas', label: 'Canvas', aspectRatio: '1:1' },
      ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: buildFanoutStream(targets),
    });
  });

  await page.goto('/workspace/demo-ws?provider=openai&bypass=1');
  await expect(page.locator('.tl-container')).toBeVisible();
  await page
    .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
    .first()
    .waitFor({ timeout: 15_000 });

  const composer = page.getByPlaceholder('describe the generation…');
  await composer.fill('neon hero portrait, tall format');
  await composer.press('Enter');
  await expect(page.getByText(/placed .* formats|placed on canvas/i)).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('H1 — export pack', () => {
  test('rail button triggers a zip download with PNGs + manifest.json', async ({ page }) => {
    await seedGeneratedRun(page);

    const focusTrigger = page.locator('[data-rail-section="focus"]');
    await focusTrigger.click();
    const exportBtn = page.getByTestId('rail-export-button');
    await expect(exportBtn).toBeVisible();

    const [download, response] = await Promise.all([
      page.waitForEvent('download'),
      page.waitForResponse(
        (res) => res.url().endsWith('/api/export') && res.request().method() === 'POST'
      ),
      exportBtn.click(),
    ]);

    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/zip');
    expect(download.suggestedFilename()).toMatch(/^aether-demo-ws\.zip$/);

    const buf = await readDownloadBytes(download);
    const archive = await JSZip.loadAsync(buf);
    const fileList = Object.keys(archive.files).sort();
    expect(fileList).toContain('manifest.json');
    const pngFiles = fileList.filter((name) => name.endsWith('.png'));
    expect(pngFiles.length).toBeGreaterThanOrEqual(1);

    const manifestRaw = await archive.file('manifest.json')!.async('string');
    const manifest = JSON.parse(manifestRaw) as {
      workspaceId: string;
      generatedAt: string;
      formats: Array<{ filename: string; aspectRatio: string; provider: string }>;
      pinnedSkills: unknown[];
      brandTokens: { palette: string[]; typography: string[] };
    };
    expect(manifest.workspaceId).toBe('demo-ws');
    expect(new Date(manifest.generatedAt).toString()).not.toBe('Invalid Date');
    expect(manifest.formats.length).toBe(pngFiles.length);
    expect(manifest.formats.every((f) => fileList.includes(f.filename))).toBe(true);
    expect(manifest.formats.every((f) => f.provider === 'openai')).toBe(true);
    expect(manifest.brandTokens).toEqual({ palette: [], typography: [] });
  });

  test('composer `/export` command hits the same handler', async ({ page }) => {
    await seedGeneratedRun(page);

    const composer = page.getByPlaceholder('describe the generation…');
    await composer.fill('/export');
    const [download, response] = await Promise.all([
      page.waitForEvent('download'),
      page.waitForResponse(
        (res) => res.url().endsWith('/api/export') && res.request().method() === 'POST'
      ),
      composer.press('Enter'),
    ]);
    expect(response.ok()).toBe(true);
    expect(download.suggestedFilename()).toMatch(/^aether-demo-ws\.zip$/);

    const archive = await JSZip.loadAsync(await readDownloadBytes(download));
    expect(archive.file('manifest.json')).not.toBeNull();
  });
});
