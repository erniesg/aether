import { test } from '@playwright/test';

// Artifact capture for PR #? (issue #26). Produces screenshots the reviewer
// agent + Ernie look at in #aether-review. Not a correctness test — the
// real assertions live in tests/e2e/cluster-lens.spec.ts.

test.describe.configure({ mode: 'serial' });

test('cluster lens — empty kanban', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('aether.references.v1');
    window.localStorage.removeItem('aether.clusters.cards.v1');
    window.localStorage.removeItem('aether.clusters.log.v1');
  });
  await page.goto('/workspace/demo-ws');
  await page.locator('[data-testid="toolbar-cluster-lens"]').click();
  await page.locator('[data-testid="cluster-lens"]').waitFor();
  await page.screenshot({
    path: 'playwright-report/issue-26/01-empty.png',
    fullPage: true,
  });
});

test('cluster lens — with cards and focus panel', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('aether.references.v1');
    window.localStorage.removeItem('aether.clusters.cards.v1');
    window.localStorage.removeItem('aether.clusters.log.v1');

    const seed = [
      { ref: 'a', cluster: '0', label: 'slow morning', source: 'pinterest', moved: 3 },
      { ref: 'b', cluster: '0', label: 'slow morning', source: 'pinterest', moved: 2 },
      { ref: 'c', cluster: '1', label: 'raw desert', source: 'xhs', moved: 1 },
    ];
    const previewUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

    const cards = seed.map((s, idx) => ({
      referenceId: `ref-${s.ref}`,
      clusterId: s.cluster,
      clusterLabel: s.label,
      thumbnailUrl: previewUrl,
      attribution: { source: s.source, url: `https://example.com/${s.ref}` },
      column: idx === 0 ? 'Shortlisted' : 'Found',
      movedAt: s.moved,
    }));
    window.localStorage.setItem('aether.clusters.cards.v1', JSON.stringify(cards));
  });

  await page.goto('/workspace/demo-ws');
  await page.locator('[data-testid="toolbar-cluster-lens"]').click();
  await page.locator('[data-testid="cluster-lens"]').waitFor();

  await page.screenshot({
    path: 'playwright-report/issue-26/02-populated.png',
    fullPage: true,
  });

  await page
    .locator('[data-testid="cluster-card"][data-reference-id="ref-b"]')
    .click();
  await page.locator('[data-testid="cluster-focus"]').waitFor();

  await page.screenshot({
    path: 'playwright-report/issue-26/03-focus-panel.png',
    fullPage: true,
  });
});
