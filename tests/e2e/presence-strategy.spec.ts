import { expect, test, type Locator, type Page } from '@playwright/test';

const strategyShape = (label: string, profileId: string) => ({
  positioning: `${label} positioning from creator context and evidence.`,
  icpAccounts: [
    { handle: '@openai', reason: 'platform builders reward credible demos' },
    { handle: '@AnthropicAI', reason: 'agent reliability audience' },
    { handle: '@modal_labs', reason: 'infra-heavy AI deployment lane' },
    { handle: '@vercel', reason: 'DX audience for builders' },
    { handle: '@convex_dev', reason: 'reactive app builders match receipts' },
  ],
  pillars: [
    { name: `${label} receipts`, evidenceRefs: [`profile:${profileId}`], exampleFormats: ['thread'] },
    { name: `${label} demos`, evidenceRefs: [`profile:${profileId}`], exampleFormats: ['demo'] },
    { name: `${label} rigor`, evidenceRefs: [`profile:${profileId}`], exampleFormats: ['opinion'] },
  ],
  cadence: '2 posts/week',
  replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
  skipList: ['generic hot takes'],
  goalMetric90d: '5 replies or DMs from named builders referencing specific posts',
});

test.describe('Spec 04 — presence strategy', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'aether.brand.v1:presence-04',
        JSON.stringify({
          id: 'brand_aether',
          name: 'aether',
          palette: [],
          type: [],
          voice: 'precise builder notes',
          knowledgeSources: [],
        })
      );
      window.localStorage.setItem(
        'aether.offer.v1:presence-04',
        JSON.stringify({
          id: 'offer_fde',
          name: 'FDE hiring signal',
          summary: 'AI engineering proof',
          claims: ['ships creator-first canvas workflows'],
          heroAsset: '',
        })
      );
      window.localStorage.setItem(
        'aether.campaign.v1:presence-04',
        JSON.stringify({
          id: 'campaign_presence',
          name: 'AI engineering presence',
          goal: 'earn FDE conversations',
          audience: 'AI tooling teams',
          channels: ['x'],
          cta: '',
        })
      );
    });
    await page.route('**/api/presence/strategy', async (route) => {
      const body = route.request().postDataJSON() as {
        profile: { id: string; label: string; xHandle: string };
        creatorContext?: unknown;
      };
      expect(body.creatorContext).toMatchObject({
        brand: { name: 'aether' },
        offer: { name: 'FDE hiring signal' },
        campaign: { name: 'AI engineering presence' },
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'proposed',
          profile: body.profile,
          strategy: strategyShape(body.profile.label, body.profile.id),
        }),
      });
    });
  });

  test('two profiles keep independent strategy state after reload', async ({ page }) => {
    await page.goto('/workspace/presence-04');
    await page.evaluate(() => {
      window.localStorage.removeItem('aether.presence.v1');
    });
    await page.reload();
    await openPresence(page);
    const flyout = page.locator('[data-rail-flyout="presence"]');

    await addProfile(flyout, 'personal', 'x.com/erniesg', 'get seen for FDE roles');
    await addProfile(flyout, 'product', 'aether_app', 'reach AI creative builders');

    await flyout.getByTestId('presence-profile-personal').getByRole('button', { name: /propose strategy/i }).click();
    await flyout.getByTestId('presence-profile-product').getByRole('button', { name: /propose strategy/i }).click();

    const personal = flyout.getByTestId('presence-profile-personal');
    const product = flyout.getByTestId('presence-profile-product');
    await expect(personal).toContainText('proposed');
    await expect(product).toContainText('proposed');
    await personal.getByRole('button', { name: /accept strategy/i }).click();
    await expect(personal).toContainText('accepted · 3 pillars');
    await expect(product).toContainText('proposed');

    await flyout.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/04/two-profiles-accepted.png',
    });

    await page.reload();
    await openPresence(page);
    const reloaded = page.locator('[data-rail-flyout="presence"]');
    await expect(reloaded.getByTestId('presence-profile-personal')).toContainText('@erniesg');
    await expect(reloaded.getByTestId('presence-profile-product')).toContainText('@aether_app');
    await expect(reloaded.getByTestId('presence-profile-personal')).toContainText('accepted · 3 pillars');
    await expect(reloaded.getByTestId('presence-profile-product')).toContainText('proposed');

    await reloaded.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/04/after-reload.png',
    });
  });
});

async function openPresence(page: Page) {
  await page.locator('[data-rail-section="presence"]').click();
  await expect(page.locator('[data-rail-flyout="presence"]')).toBeVisible();
}

async function addProfile(flyout: Locator, label: string, handle: string, goal: string) {
  await flyout.getByTestId('presence-profile-label').fill(label);
  await flyout.getByTestId('presence-profile-handle').fill(handle);
  await flyout.getByTestId('presence-profile-goal').fill(goal);
  await flyout.getByTestId('presence-profile-add').click();
}
