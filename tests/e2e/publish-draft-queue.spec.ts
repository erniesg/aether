import { expect, test } from '@playwright/test';

test.describe('Spec 05 — publish draft queue', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.route('https://x.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>X intent</title>',
      })
    );
    await page.goto('/workspace/demo-ws');
    await page.evaluate(() => {
      window.localStorage.removeItem('aether.publishDrafts.v1');
      window.localStorage.removeItem('aether.scheduledPosts.v1');
    });
    await page.reload();
  });

  test('draft edit opens exact X intent popup and persists posted permalink', async ({
    context,
    page,
  }) => {
    await page.locator('[data-rail-section="scheduled"]').click();
    const flyout = page.locator('[data-rail-flyout="scheduled"]');
    await expect(flyout).toBeVisible();

    await flyout.getByTestId('publish-draft-text').fill('Initial draft');
    await flyout.getByTestId('publish-draft-pillar').fill('launch');
    await flyout.getByTestId('publish-draft-add').click();

    const row = flyout.getByTestId('publish-draft-row').first();
    await expect(row).toBeVisible();
    await row.getByTestId('publish-draft-edit-text').fill('Edited pass for X');
    await row.getByTestId('publish-draft-edit-text').blur();

    await expect(row.getByTestId('publish-draft-confirm')).toHaveAttribute(
      'href',
      'https://x.com/intent/post?text=Edited+pass+for+X'
    );

    await flyout.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/05/queue-with-drafts.png',
    });

    const popupPromise = context.waitForEvent('page');
    await row.getByTestId('publish-draft-confirm').click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(
      'https://x.com/intent/post?text=Edited+pass+for+X'
    );
    await popup.close();

    await expect(row).toContainText('posted');
    await row.getByTestId('publish-draft-receipt').fill(
      'https://x.com/aether/status/1780000000000000002'
    );
    await row.getByTestId('publish-draft-receipt').blur();
    await expect(row.getByTestId('publish-draft-receipt-link')).toHaveAttribute(
      'href',
      'https://x.com/aether/status/1780000000000000002'
    );

    await flyout.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/05/posted-state.png',
    });

    await flyout.getByTestId('publish-draft-text').fill('a'.repeat(281));
    await flyout.getByTestId('publish-draft-pillar').fill('overflow');
    await flyout.getByTestId('publish-draft-add').click();
    await expect(
      flyout.getByTestId('publish-draft-row').first().getByTestId('publish-draft-count')
    ).toHaveText('281/280');
    await expect(
      flyout.getByTestId('publish-draft-row').first().getByTestId('publish-draft-confirm')
    ).toHaveAttribute('aria-disabled', 'true');

    await flyout.screenshot({
      path: 'docs/specs/2026-06-10-social-loop/evidence/05/over-length-state.png',
    });

    await page.reload();
    await page.locator('[data-rail-section="scheduled"]').click();
    const reloaded = page.locator('[data-rail-flyout="scheduled"]');
    await expect(
      reloaded.getByTestId('publish-draft-edit-text').nth(1)
    ).toHaveValue('Edited pass for X');
    await expect(
      reloaded.getByTestId('publish-draft-receipt-link')
    ).toHaveAttribute('href', 'https://x.com/aether/status/1780000000000000002');
  });
});
