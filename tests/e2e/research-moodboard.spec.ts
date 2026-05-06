import { expect, test, type Page } from '@playwright/test';
import { seedDemoCreatorContext } from './helpers/demo-creator-context';

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

function toSse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: generate\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function buildGenerateStream(frames: Array<{ id: string; label?: string; aspectRatio: string }>): string {
  const resolved =
    frames.length > 0 ? frames : [{ id: 'canvas', label: 'Canvas', aspectRatio: '4:5' }];
  const provider = {
    id: 'openai',
    displayName: 'OpenAI Images',
    model: 'gpt-image-1',
  };
  return toSse([
    {
      type: 'run.started',
      at: 1,
      mode: 'single',
      frames: { total: resolved.length },
    },
    {
      type: 'plan.ready',
      at: 2,
      plannerMode: 'bypass',
      rewrittenPrompt: 'research moodboard key visual',
      aspectRatio: resolved[0]?.aspectRatio ?? '4:5',
      provider,
    },
    ...resolved.flatMap((frame, index) => [
      {
        type: 'frame.started',
        at: 3 + index * 2,
        frame: {
          id: frame.id,
          label: frame.label,
          index: index + 1,
          total: resolved.length,
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
          total: resolved.length,
          aspectRatio: frame.aspectRatio,
        },
        provider,
        latencyMs: 32,
        image: {
          url: `https://cdn.test/research-generated-${index + 1}.png`,
          width: 1080,
          height: 1350,
          mimeType: 'image/png',
        },
      },
    ]),
    {
      type: 'run.completed',
      at: 99,
      status: 'ok',
      frames: { total: resolved.length, completed: resolved.length, failed: 0 },
      provider,
      rewrittenPrompt: 'research moodboard key visual',
      aspectRatio: resolved[0]?.aspectRatio ?? '4:5',
      firstImageUrl: 'https://cdn.test/research-generated-1.png',
      elapsedMs: 128,
    },
  ]);
}

async function installMocks(page: Page, generateRequests: Array<Record<string, unknown>>) {
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
    const body = route.request().postDataJSON() as Record<string, unknown>;
    generateRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: buildGenerateStream(
        ((body.targets as Array<{ id: string; label?: string; aspectRatio: string }>) ?? [])
      ),
    });
  });
}

test.describe('research to moodboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('aether.references.v1');
      window.localStorage.removeItem('aether.clusters.cards.v1');
      window.localStorage.removeItem('aether.clusters.log.v1');
    });
  });

  test('scout research -> cluster -> tweak moodboard -> generate', async ({ page }) => {
    const generateRequests: Array<Record<string, unknown>> = [];
    await seedDemoCreatorContext(page);
    await installMocks(page, generateRequests);

    await page.goto('/workspace/demo-ws?provider=openai&model=gpt-image-1&bypass=1');
    await expect(page.locator('.tl-container')).toBeVisible();

    await page.locator('[data-rail-section="research"]').click();
    const research = page.locator('[data-rail-flyout="research"]');
    await research.getByLabel('research seeds').fill('warm shelf #barrierglow @ritualstudio');
    await research.getByTestId('research-run').click();

    await expect(page.getByTestId('cluster-lens')).toBeVisible();
    await expect(
      page.locator('[data-cluster-column="Found"]').getByText('warm shelf ritual').first()
    ).toBeVisible();

    await page.getByRole('button', { name: /make moodboard warm shelf ritual/i }).click();
    const moodboard = page.getByTestId('moodboard-panel');
    await expect(moodboard).toBeVisible();
    await moodboard.getByRole('button', { name: 'warmer' }).click();
    await moodboard.getByRole('button', { name: 'product-led' }).click();
    await moodboard.getByTestId('moodboard-generate').click();

    await expect.poll(() => generateRequests.length, { timeout: 10_000 }).toBe(1);
    const request = generateRequests[0]!;
    expect(String(request.prompt)).toContain('warm shelf ritual');
    expect(String(request.prompt)).toContain('warmer, product-led');
    expect(String(request.prompt)).toContain('Brand: Solstice Skin');
    expect(String(request.prompt)).toContain('Pinned references: 3 sources');
  });
});
