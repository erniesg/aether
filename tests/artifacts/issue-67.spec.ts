import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Autoloop artifact spec for #67. UI-free PR — the foundation lands the
 * Convex schema + tool-registry surface, no workspace changes to screenshot.
 *
 * The spec therefore:
 *   1. Asserts `convex/schema.ts` declares the `textOverlay` table with the
 *      expected indexes + `text-overlay` artifact kind + `draft-executor`
 *      status.
 *   2. Asserts `lib/tool/registry.ts` exposes a `text-apply` entry.
 *   3. Boots the landing page and captures a screenshot as a visible
 *      proof-of-run for the autoloop artifact harness.
 */
test.describe('#67 — text-overlay foundation artifact', () => {
  test('schema + registry were migrated; landing page still renders', async ({ page }, testInfo) => {
    const root = resolve(__dirname, '..', '..');

    const schemaSrc = readFileSync(resolve(root, 'convex/schema.ts'), 'utf8');
    expect(schemaSrc, 'textOverlay table declared').toContain('textOverlay: defineTable(');
    expect(schemaSrc, 'by_wsId index declared').toContain("index('by_wsId', ['wsId'])");
    expect(schemaSrc, 'by_artboardId index declared').toContain(
      "index('by_artboardId', ['artboardId'])"
    );
    expect(schemaSrc, "'text-overlay' added to capabilityRun.artifactKind").toContain(
      "v.literal('text-overlay')"
    );
    expect(schemaSrc, "'draft-executor' added to capabilityRun.status").toContain(
      "v.literal('draft-executor')"
    );

    const registrySrc = readFileSync(resolve(root, 'lib/tool/registry.ts'), 'utf8');
    expect(registrySrc, 'text-apply registered').toContain("'text-apply':");
    expect(registrySrc, 'ArtifactKind union declared').toContain(
      "export type ArtifactKind ="
    );

    const dump = {
      textOverlayTablePresent: true,
      textApplyRegistered: true,
      indexes: ['by_wsId', 'by_artboardId'],
      capabilityRunArtifactKindExtended: true,
      capabilityRunStatusExtended: true,
    };
    await testInfo.attach('schema-dump.json', {
      body: JSON.stringify(dump, null, 2),
      contentType: 'application/json',
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'aether' })).toBeVisible();
    const screenshot = await page.screenshot();
    await testInfo.attach('landing.png', {
      body: screenshot,
      contentType: 'image/png',
    });
  });
});
