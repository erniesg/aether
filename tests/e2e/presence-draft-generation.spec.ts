import { expect, test, type Locator, type Page } from '@playwright/test';

const acceptedStrategy = {
  positioning: 'Ship visible agents with production receipts.',
  icpAccounts: [
    { handle: '@openai', reason: 'platform builders' },
    { handle: '@AnthropicAI', reason: 'agent builders' },
    { handle: '@modal_labs', reason: 'infra builders' },
    { handle: '@vercel', reason: 'DX builders' },
    { handle: '@convex_dev', reason: 'reactive app builders' },
  ],
  pillars: [
    { name: 'agent harnesses', evidenceRefs: ['repo:aether'], exampleFormats: ['thread'] },
    { name: 'visible demos', evidenceRefs: ['site:ernie.sg'], exampleFormats: ['demo'] },
    { name: 'production rigor', evidenceRefs: ['resume:resume.md'], exampleFormats: ['opinion'] },
  ],
  cadence: '2 posts/week',
  replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
  skipList: ['generic hot takes'],
  goalMetric90d: '5 DMs from named builders',
};

test.describe('Spec 08 — presence draft generation', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.route('https://x.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>X intent</title>',
      })
    );
    await page.addInitScript(() => {
      window.localStorage.removeItem('aether.presence.v1');
      window.localStorage.removeItem('aether.publishDrafts.v1');
      window.localStorage.removeItem('aether.scheduledPosts.v1');
    });
    await page.route('**/api/presence/strategy', async (route) => {
      const body = route.request().postDataJSON() as {
        profile: { id: string; label: string; xHandle: string };
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'proposed',
          profile: body.profile,
          strategy: acceptedStrategy,
        }),
      });
    });
    await page.route('**/api/presence/drafts', async (route) => {
      const body = route.request().postDataJSON() as {
        lapId: string;
        profile: { id: string };
        strategy: { id: string; pillars: Array<{ name: string }> };
      };
      expect(body.lapId).toBe(`presence_${body.profile.id}_${body.strategy.id}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          lapId: body.lapId,
          drafts: [
            {
              kind: 'post',
              text: 'Receipt-grounded post draft',
              pillar: 'agent harnesses',
              receipt: { kind: 'evidence-fact', ref: 'repo:aether#claim-1' },
            },
            {
              kind: 'reply',
              text: 'Receipt-grounded reply draft',
              pillar: 'agent harnesses',
              targetUrl: 'https://x.com/openai/status/1780000000000000001',
              receipt: {
                kind: 'signal-post',
                ref: 'https://x.com/openai/status/1780000000000000001',
              },
            },
          ],
          rejected: [],
        }),
      });
    });
  });

  test('generation fills the publish queue and preserves the X intent gate', async ({
    context,
    page,
  }) => {
    await page.goto('/workspace/presence-08');
    await openPresence(page);
    const presence = page.locator('[data-rail-flyout="presence"]');
    await addProfile(presence, 'personal', '@erniesg', 'get seen for FDE roles');
    const row = presence.getByTestId('presence-profile-personal');

    await expect(row.getByRole('button', { name: /generate drafts/i })).toBeDisabled();
    await row.getByRole('button', { name: /propose strategy/i }).click();
    await row.getByRole('button', { name: /accept strategy/i }).click();
    await row.getByRole('button', { name: /generate drafts/i }).click();
    await expect(row).toContainText('1 posts · 1 replies');

    await page.locator('[data-rail-section="scheduled"]').click();
    const queue = page.locator('[data-rail-flyout="scheduled"]');
    await expect(queue).toBeVisible();
    const postRow = queue
      .getByTestId('publish-draft-row')
      .filter({ hasText: 'Receipt-grounded post draft' });
    const replyRow = queue
      .getByTestId('publish-draft-row')
      .filter({ hasText: 'Receipt-grounded reply draft' });

    await expect(postRow).toContainText('agent harnesses');
    await expect(postRow.getByTestId('publish-draft-source-receipt')).toContainText(
      'receipt repo:aether#claim-1'
    );
    await expect(replyRow.getByTestId('publish-draft-source-receipt')).toContainText(
      'receipt https://x.com/openai/status/1780000000000000001'
    );
    await expect(postRow.getByTestId('publish-draft-confirm')).toHaveAttribute(
      'href',
      'https://x.com/intent/post?text=Receipt-grounded+post+draft'
    );

    await queue.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/08/generated-drafts-queue.png',
    });

    const popupPromise = context.waitForEvent('page');
    await postRow.getByTestId('publish-draft-confirm').click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(
      'https://x.com/intent/post?text=Receipt-grounded+post+draft'
    );
    await popup.close();
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
