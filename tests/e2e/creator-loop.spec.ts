import { expect, test, type Download, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { seedDemoCreatorContext } from './helpers/demo-creator-context';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

const REFERENCES = [
  {
    id: 'ref_slow_morning',
    source: 'pinterest',
    url: 'https://pin.it/slow-morning',
    previewUrl: 'https://cdn.test/reference-slow-morning.png',
  },
  {
    id: 'ref_golden_hour',
    source: 'xhs',
    url: 'https://xhs.example/golden-hour',
    previewUrl: 'https://cdn.test/reference-golden-hour.png',
  },
] as const;

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function slugLabel(label?: string, fallback = 'canvas'): string {
  return (label ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildGenerateStream(frames: Array<{ id: string; label?: string; aspectRatio: string }>): string {
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
      rewrittenPrompt: 'creator-loop key visual',
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
          url: `https://cdn.test/generated-${index + 1}-${slugLabel(frame.label, frame.id)}.png`,
          width: frame.aspectRatio === '16:9' ? 1200 : 1080,
          height: frame.aspectRatio === '4:5' ? 1350 : frame.aspectRatio === '9:16' ? 1920 : 627,
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
      rewrittenPrompt: 'creator-loop key visual',
      aspectRatio: frames[0]?.aspectRatio ?? '4:5',
      firstImageUrl: `https://cdn.test/generated-1-${slugLabel(frames[0]?.label, frames[0]?.id)}.png`,
      elapsedMs: 128,
    },
  ]);
}

async function readDownloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error('download had no path');
  return readFile(path);
}

async function installCreatorLoopMocks(page: Page, requests: Array<Record<string, unknown>>) {
  await page.route('https://cdn.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_BYTES,
    });
  });

  await page.route('**/api/reference-ingest', async (route) => {
    const body = route.request().postDataJSON() as { url?: string };
    const match = REFERENCES.find((ref) => ref.url === body.url);
    if (!match) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'unknown reference fixture' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        record: {
          id: match.id,
          kind: 'image',
          previewUrl: match.previewUrl,
          fullUrl: match.url,
          attribution: { source: match.source, url: match.url },
          capturedAt: '2026-04-24T12:00:00.000Z',
        },
        fallback: false,
        providerId: match.source,
      }),
    });
  });

  await page.route('**/api/clusters/run', async (route) => {
    const body = route.request().postDataJSON() as {
      images?: Array<{ id: string }>;
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        provider: 'clip-modal',
        items: (body.images ?? []).map((image) => ({ id: image.id, clusterId: 0 })),
        nClusters: 1,
        nNoise: 0,
      }),
    });
  });

  await page.route('**/api/clusters/label', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        labels: [{ clusterId: '0', label: 'slow glow' }],
      }),
    });
  });

  await page.route('**/api/generate', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    const targets =
      (body.targets as Array<{ id: string; label?: string; aspectRatio: string }>) ?? [];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: buildGenerateStream(targets),
    });
  });
}

test.describe('creator loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('aether.references.v1');
      window.localStorage.removeItem('aether.clusters.cards.v1');
      window.localStorage.removeItem('aether.clusters.log.v1');
      window.localStorage.removeItem('aether.scheduledPosts.v1');
    });
  });

  test('ingest references -> generate key visual fanout -> export -> schedule previews', async ({
    page,
  }) => {
    const generateRequests: Array<Record<string, unknown>> = [];
    await seedDemoCreatorContext(page);
    await installCreatorLoopMocks(page, generateRequests);

    await page.goto('/workspace/demo-ws?provider=openai&model=gpt-image-1&bypass=1');
    await expect(page.locator('.tl-container')).toBeVisible();
    await page
      .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
      .first()
      .waitFor({ timeout: 15_000 });

    await page.locator('[data-rail-section="references"]').click();
    const refsFlyout = page.locator('[data-rail-flyout="references"]');
    for (const ref of REFERENCES) {
      await refsFlyout.getByLabel('reference source').fill(ref.url);
      await refsFlyout.getByRole('button', { name: /^ingest$/i }).click();
    }
    await expect(refsFlyout.locator('[data-testid="reference-chip"]')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: /input set .*slow morning drop.*5 pinned/i })
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await page.getByTestId('toolbar-cluster-lens').click();
    await page.getByTestId('cluster-lens-run').click();
    await expect(page.locator('[data-cluster-column="Found"]').getByText('slow glow').first()).toBeVisible();
    await page.getByTestId('toolbar-cluster-lens').click();

    const composer = page.getByPlaceholder('describe the generation…');
    await composer.fill('make the campaign key visual from these references');
    await composer.press('Enter');

    await expect.poll(() => generateRequests.length, { timeout: 10_000 }).toBe(1);
    const [request] = generateRequests;
    expect((request.refs as unknown[]).length).toBe(2);
    expect(String(request.prompt)).toContain('Brand: Solstice Skin');
    expect(String(request.prompt)).toContain('Pinned references: 2 sources');
    expect(
      ((request.targets as Array<{ aspectRatio: string }>) ?? [])
        .map((target) => target.aspectRatio)
        .sort()
    ).toEqual(['16:9', '4:5', '9:16', '9:16']);
    await expect(page.getByText(/placed 4\/4 formats/i)).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-rail-section="focus"]').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('rail-export-button').click(),
    ]);
    const archive = await JSZip.loadAsync(await readDownloadBytes(download));
    const manifest = JSON.parse(await archive.file('manifest.json')!.async('string')) as {
      formats: Array<{ id: string; filename: string }>;
    };
    expect(manifest.formats).toHaveLength(4);

    await page.locator('[data-rail-section="scheduled"]').click();
    const publishFlyout = page.locator('[data-rail-flyout="scheduled"]');
    await publishFlyout.getByTestId('publish-platform-tiktok').click();
    await publishFlyout.getByTestId('publish-platform-linkedin').click();
    await publishFlyout.getByTestId('publish-caption').fill('slow glow key visual');
    await publishFlyout.getByTestId('publish-hashtags').fill('#aether #launch');
    await publishFlyout.getByTestId('publish-schedule-submit').click();

    await expect(publishFlyout.locator('[data-scheduled-post-id]')).toHaveCount(3);
    const overlay = page.getByTestId('publish-preview-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('[data-testid="publish-preview-card"]')).toHaveCount(3);
    await expect(overlay.locator('[data-platform="instagram"] img')).toHaveAttribute(
      'src',
      /generated-1-ig-post/
    );
    await expect(overlay.locator('[data-platform="tiktok"] img')).toHaveAttribute(
      'src',
      /generated-2-story/
    );
    await expect(overlay.locator('[data-platform="linkedin"] img')).toHaveAttribute(
      'src',
      /generated-4-linkedin/
    );
  });
});
