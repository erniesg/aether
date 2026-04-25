import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = process.env.PLAYWRIGHT_ARTIFACT_DIR || 'artifacts';
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

const RESEARCH_RECORDS = [
  {
    id: 'ref_research_01',
    kind: 'image',
    previewUrl: 'https://cdn.test/research-01.png',
    fullUrl: 'https://www.pinterest.com/search/pins/?q=warm%20shelf',
    attribution: {
      source: 'pinterest',
      author: 'Shelf Studio',
      url: 'https://www.pinterest.com/search/pins/?q=warm%20shelf',
    },
    capturedAt: '2026-04-25T00:00:00.000Z',
    title: 'warm shelf',
    usageIntent: 'research direction',
    tags: ['research', 'pinterest', 'shelf'],
    notes: 'creator keyword; warm shelf',
  },
  {
    id: 'ref_research_02',
    kind: 'image',
    previewUrl: 'https://cdn.test/research-02.png',
    fullUrl: 'https://www.instagram.com/explore/tags/barrierglow/',
    attribution: {
      source: 'instagram',
      url: 'https://www.instagram.com/explore/tags/barrierglow/',
    },
    capturedAt: '2026-04-25T00:00:00.000Z',
    title: 'instagram #barrierglow',
    usageIntent: 'research direction',
    tags: ['research', 'instagram', 'hashtag'],
  },
  {
    id: 'ref_research_03',
    kind: 'image',
    previewUrl: 'https://cdn.test/research-03.png',
    fullUrl: 'https://www.tiktok.com/@ritualstudio',
    attribution: {
      source: 'tiktok',
      author: 'ritualstudio',
      url: 'https://www.tiktok.com/@ritualstudio',
    },
    capturedAt: '2026-04-25T00:00:00.000Z',
    title: 'tiktok @ritualstudio',
    usageIntent: 'research direction',
    tags: ['research', 'tiktok', 'account'],
  },
] as const;

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function buildGenerateStream(): string {
  const provider = {
    id: 'openai',
    displayName: 'OpenAI Images',
    model: 'gpt-image-1',
  };
  return toSse([
    { type: 'run.started', at: 1, mode: 'single', frames: { total: 1 } },
    {
      type: 'plan.ready',
      at: 2,
      plannerMode: 'bypass',
      rewrittenPrompt: 'research moodboard key visual',
      aspectRatio: '4:5',
      provider,
    },
    {
      type: 'frame.started',
      at: 3,
      frame: { id: 'canvas', index: 1, total: 1, aspectRatio: '4:5' },
      provider,
    },
    {
      type: 'frame.completed',
      at: 4,
      frame: { id: 'canvas', index: 1, total: 1, aspectRatio: '4:5' },
      provider,
      latencyMs: 32,
      image: {
        url: 'https://cdn.test/research-generated.png',
        width: 1080,
        height: 1350,
        mimeType: 'image/png',
      },
    },
    {
      type: 'run.completed',
      at: 5,
      status: 'ok',
      frames: { total: 1, completed: 1, failed: 0 },
      provider,
      rewrittenPrompt: 'research moodboard key visual',
      aspectRatio: '4:5',
      firstImageUrl: 'https://cdn.test/research-generated.png',
      elapsedMs: 128,
    },
  ]);
}

async function installMocks(page: Page) {
  await page.route('https://cdn.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_BYTES,
    });
  });

  await page.route('**/api/research', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        plan: {
          seedText: 'warm shelf #barrierglow @ritualstudio',
          platforms: ['pinterest', 'instagram', 'tiktok'],
          targets: [],
          querySummary: 'warm shelf',
        },
        records: RESEARCH_RECORDS,
        scrapedCount: 0,
        materializedCount: RESEARCH_RECORDS.length,
      }),
    });
  });

  await page.route('**/api/clusters/run', async (route) => {
    const body = route.request().postDataJSON() as { images?: Array<{ id: string }> };
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
        labels: [{ clusterId: '0', label: 'warm shelf ritual' }],
      }),
    });
  });

  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: buildGenerateStream(),
    });
  });
}

async function capture(page: Page, name: string) {
  ensureDir(ARTIFACT_DIR);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, name),
    fullPage: true,
  });
}

test.describe('artifact capture · research to moodboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('aether.references.v1');
      window.localStorage.removeItem('aether.clusters.cards.v1');
      window.localStorage.removeItem('aether.clusters.log.v1');
    });
  });

  test('captures rail, cluster lens, moodboard, and generated canvas states', async ({ page }) => {
    await installMocks(page);
    await page.goto('/workspace/demo-ws?provider=openai&model=gpt-image-1&bypass=1');
    await expect(page.locator('.tl-container')).toBeVisible();

    await page.locator('[data-rail-section="research"]').click();
    const research = page.locator('[data-rail-flyout="research"]');
    await research.getByLabel('research seeds').fill('warm shelf #barrierglow @ritualstudio');
    await expect(research.getByTestId('research-run')).toBeVisible();
    await capture(page, 'research-moodboard-01-rail.png');

    await research.getByTestId('research-run').click();
    await expect(page.getByTestId('cluster-lens')).toBeVisible();
    await expect(page.getByText('warm shelf ritual').first()).toBeVisible();
    await capture(page, 'research-moodboard-02-clusters.png');

    await page.getByRole('button', { name: /make moodboard warm shelf ritual/i }).click();
    const moodboard = page.getByTestId('moodboard-panel');
    await expect(moodboard).toHaveAttribute('data-taxonomy', 'tool');
    await moodboard.getByRole('button', { name: 'warmer' }).click();
    await moodboard.getByRole('button', { name: 'product-led' }).click();
    await capture(page, 'research-moodboard-03-moodboard.png');

    await moodboard.getByTestId('moodboard-generate').click();
    await expect(page.getByText(/placed|completed|research moodboard/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await capture(page, 'research-moodboard-04-generated.png');
  });
});
