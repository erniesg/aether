import { expect, test } from '@playwright/test';

/**
 * A4 — pin-as-capability hero flow.
 *
 * Route-mocks /api/generate (initial run), /api/capability/propose (Claude
 * distillation), and /api/capability/rerun (second run via the pinned chip)
 * so the test is deterministic without provider credentials.
 */
test.describe('A4 — pin-as-capability', () => {
  test('generate → pin → rerun via chip writes a run linked to the same definitionId', async ({
    page,
  }) => {
    const IMAGE_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const IMAGE_B = IMAGE_A;

    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          plan: { rewrittenPrompt: 'a still life, brand palette', aspectRatio: '1:1' },
          provider: { id: 'mock', displayName: 'mock', model: 'mock-model' },
          result: {
            latencyMs: 50,
            images: [{ url: IMAGE_A, width: 1, height: 1, mimeType: 'image/png' }],
          },
        }),
      });
    });

    await page.route('**/api/capability/propose', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          proposal: {
            name: 'brand recolor',
            trigger: 'recolor the selected layer using the brand palette',
            paramSchema: {
              type: 'object',
              properties: { layerId: { type: 'string' } },
              required: ['layerId'],
            },
            notes: 'anchors to pinned brand tokens',
          },
        }),
      });
    });

    const rerunRequests: Array<{ body: unknown; url: string }> = [];
    await page.route('**/api/capability/rerun', async (route) => {
      rerunRequests.push({
        body: route.request().postDataJSON(),
        url: route.request().url(),
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          definitionId: (route.request().postDataJSON() as { definition: { id: string } }).definition.id,
          plan: { rewrittenPrompt: 'rerun · a still life, brand palette', aspectRatio: '1:1' },
          provider: { id: 'mock', displayName: 'mock', model: 'mock-model' },
          result: {
            latencyMs: 40,
            images: [{ url: IMAGE_B, width: 1, height: 1, mimeType: 'image/png' }],
          },
        }),
      });
    });

    await page.goto('/workspace/demo-ws');

    // Wait for tldraw to finish hydrating — the editor needs to be live before
    // the image can land. The dynamic-import placeholder disappears on mount.
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({ timeout: 30_000 });
    await page.waitForSelector('.tl-container, .tl-canvas', { timeout: 30_000 });

    // A4.1 — first generation.
    const composer = page.getByRole('textbox');
    await composer.fill('a still life');
    await composer.press('Enter');

    // open the sync · provenance rail flyout so the action log is visible
    const syncIcon = page.getByRole('button', { name: /sync · provenance/i }).first();
    await syncIcon.click();

    const pinButton = page.getByRole('button', { name: /pin as skill/i }).first();
    await expect(pinButton).toBeAttached({ timeout: 10_000 });

    // A4.2 — open pin dialog, pin the skill. Pin button is a hover affordance;
    // force the click so the opacity-0 gate doesn't block Playwright.
    await pinButton.click({ force: true });
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /pin skill/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // A4.3 — the pinned chip lights up on the floating toolbar.
    const pinnedChip = page.getByRole('button', { name: /pinned · brand recolor/i });
    await expect(pinnedChip).toBeVisible({ timeout: 5_000 });

    // A4.4 — clicking the chip fires the rerun API with the same definition.
    await pinnedChip.click();
    await expect.poll(() => rerunRequests.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const first = rerunRequests[0].body as { definition: { id: string; name: string } };
    expect(first.definition.name).toBe('brand recolor');
    expect(first.definition.id).toMatch(/^cap_/);
  });
});
