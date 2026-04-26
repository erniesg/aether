import { expect, test } from '@playwright/test';

/**
 * AC6 — factory-driven Skill authoring loop.
 *
 * Flow under test (mirrors the AC5 spec in issue #123):
 *   1. Creator types a "write a skill that …" prompt in the composer.
 *   2. Workspace shell opens the SkillAcceptDialog and POSTs to
 *      /api/capability/draft-skill — Claude drafts a SKILL.md.
 *   3. The dialog renders the draft (name, description, instructions).
 *   4. Creator clicks "pin skill" → /api/capability/accept-skill writes
 *      SKILL.md to disk and (if Convex is provisioned) inserts a row.
 *   5. The skill chip appears on the floating toolbar and clicking it dispatches
 *      /api/skill/run.
 *
 * Routes are mocked so the test is deterministic without an Anthropic key or
 * filesystem mutations.
 */
test.describe('A5 — author skill via factory', () => {
  test('write skill prompt → accept → chip pinned → chip click invokes /api/skill/run', async ({
    page,
  }) => {
    const draftCalls: Array<unknown> = [];
    const acceptCalls: Array<unknown> = [];
    const runCalls: Array<unknown> = [];

    await page.route('**/api/capability/draft-skill', async (route) => {
      draftCalls.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          manifest: {
            name: 'neon-drench',
            version: 1,
            description: 'Drench an image in neon light wash.',
            tools: [],
            referenceFiles: [],
            instructions: [
              '# neon-drench',
              '',
              'Apply a neon wash to the input image.',
              '',
              '## Output format',
              '',
              '```json',
              '{ "ok": true, "result": { "imageUrl": "..." } }',
              '```',
            ].join('\n'),
          },
        }),
      });
    });

    await page.route('**/api/capability/accept-skill', async (route) => {
      acceptCalls.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          manifestPathRelative: 'lib/agent/skills/neon-drench/SKILL.md',
          skillRef: {
            kind: 'skill',
            id: 'neon-drench',
            version: 1,
            manifestPath: '/repo/lib/agent/skills/neon-drench/SKILL.md',
            manifest: {
              name: 'neon-drench',
              version: 1,
              description: 'Drench an image in neon light wash.',
              tools: [],
              referenceFiles: [],
              instructions: '# neon-drench\n\n## Output format\n\n```json\n{}\n```',
            },
          },
        }),
      });
    });

    await page.route('**/api/skill/run', async (route) => {
      runCalls.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: { skill: 'neon-drench', message: 'mocked' },
          cacheHitTokens: 0,
        }),
      });
    });

    await page.goto('/workspace/demo-skill-author?bypass=1');

    // tldraw must be live before the composer is reachable; use the same gate
    // pin-capability.spec.ts uses.
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({ timeout: 30_000 });
    await page.waitForSelector('.tl-container, .tl-canvas', { timeout: 30_000 });

    // 1. Type the author-skill prompt and submit.
    const composer = page.getByRole('textbox');
    await composer.fill('write a skill that neon-drenches any image on the canvas');
    await composer.press('Shift+Enter');

    // 2. Skill accept dialog opens; the draft renders.
    const dialog = page.getByTestId('skill-accept-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('skill-accept-name')).toHaveValue('neon-drench');
    await expect(page.getByTestId('skill-accept-description')).toContainText(
      /neon light wash/i
    );

    // 3. Accept.
    await page.getByTestId('skill-accept-confirm').click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 4. The toolbar chip lights up.
    const chip = page.getByRole('button', { name: /pinned · neon-drench/i });
    await expect(chip).toBeVisible({ timeout: 5_000 });

    // 5. Clicking the chip fires /api/skill/run with the manifest path.
    await chip.click();
    await expect.poll(() => runCalls.length, { timeout: 5_000 }).toBeGreaterThan(0);

    expect(draftCalls.length).toBeGreaterThan(0);
    expect(acceptCalls.length).toBe(1);
    const accepted = acceptCalls[0] as { manifest: { name: string } };
    expect(accepted.manifest.name).toBe('neon-drench');
    const ranWith = runCalls[0] as { manifestPath?: string; skillRef?: { id: string } };
    // Either path is fine — both branches are wired.
    expect(ranWith.manifestPath || ranWith.skillRef?.id).toBeTruthy();
  });
});
