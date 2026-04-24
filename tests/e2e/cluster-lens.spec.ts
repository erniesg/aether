import { expect, test } from '@playwright/test';

// Six fixture references that span two visually-similar "clusters" so the
// kanban has material to group. The /api/reference-ingest route echoes these
// records back; /api/clusters/run returns a deterministic cluster assignment;
// /api/clusters/label returns 2-3 word direction names.

const FIXTURES = [
  { id: 'ref-01', cluster: 0, source: 'pinterest', url: 'https://pin.it/one' },
  { id: 'ref-02', cluster: 0, source: 'pinterest', url: 'https://pin.it/two' },
  { id: 'ref-03', cluster: 0, source: 'pinterest', url: 'https://pin.it/three' },
  { id: 'ref-04', cluster: 1, source: 'xhs', url: 'https://xhs.example/a' },
  { id: 'ref-05', cluster: 1, source: 'xhs', url: 'https://xhs.example/b' },
  { id: 'ref-06', cluster: 1, source: 'tiktok', url: 'https://tiktok.example/c' },
];

const PREVIEW_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

test.describe('cluster lens — kanban', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('aether.references.v1');
      window.localStorage.removeItem('aether.clusters.cards.v1');
      window.localStorage.removeItem('aether.clusters.log.v1');
    });

    // ingest a reference per call (the UI submits one URL at a time)
    await page.route('**/api/reference-ingest', async (route) => {
      const body = route.request().postDataJSON() as { url?: string };
      const match = FIXTURES.find((f) => f.url === body.url);
      if (!match) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'unknown fixture' }),
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
            previewUrl: PREVIEW_URL,
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
      const items = (body.images ?? []).map((img) => {
        const match = FIXTURES.find((f) => f.id === img.id);
        return { id: img.id, clusterId: match?.cluster ?? -1 };
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'clip-modal',
          items,
          nClusters: 2,
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
          labels: [
            { clusterId: '0', label: 'slow morning' },
            { clusterId: '1', label: 'raw desert' },
          ],
        }),
      });
    });
  });

  test('ingest 6 refs → cluster run → drag to shortlist → focus panel', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');

    // 1) Open references rail and paste each fixture URL.
    await page.locator('[data-rail-section="references"]').click();
    const flyout = page.locator('[data-rail-flyout="references"]');
    for (const fixture of FIXTURES) {
      await flyout.getByLabel('reference source').fill(fixture.url);
      await flyout.getByRole('button', { name: /^ingest$/i }).click();
      await expect(
        flyout.locator(`[data-testid="reference-chip"][data-reference-source="${fixture.source}"]`)
      ).toHaveCount(
        FIXTURES.filter(
          (f) => f.source === fixture.source && FIXTURES.indexOf(f) <= FIXTURES.indexOf(fixture)
        ).length
      );
    }

    // 2) Close the rail to uncover the canvas toolbar.
    await page.keyboard.press('Escape');

    // 3) Toggle the cluster lens from the floating toolbar.
    await page.locator('[data-testid="toolbar-cluster-lens"]').click();
    const lens = page.locator('[data-testid="cluster-lens"]');
    await expect(lens).toBeVisible();

    // 4) Trigger a clustering run.
    await page.locator('[data-testid="cluster-lens-run"]').click();

    // 5) Assert four columns and that `Found` now has two groups with labels.
    const columns = await page.locator('[data-cluster-column]').all();
    expect(columns.length).toBe(4);
    const foundCol = page.locator('[data-cluster-column="Found"]');
    // Label repeats in group header + per-card tag; assert presence via
    // first-match rather than strict-unique locator.
    await expect(foundCol.getByText('slow morning').first()).toBeVisible();
    await expect(foundCol.getByText('raw desert').first()).toBeVisible();

    // 6) Drag `ref-01` onto Shortlisted and assert it landed there.
    const firstCard = page.locator(
      '[data-testid="cluster-card"][data-reference-id="ref-01"]'
    );
    const shortlisted = page.locator('[data-cluster-column="Shortlisted"]');
    await firstCard.dragTo(shortlisted);
    await expect(
      shortlisted.locator('[data-reference-id="ref-01"]')
    ).toBeVisible();

    // 7) Click the card → right-rail focus panel appears.
    await page
      .locator('[data-testid="cluster-card"][data-reference-id="ref-01"]')
      .click();
    await expect(page.locator('[data-testid="cluster-focus"]')).toBeVisible();
  });
});
