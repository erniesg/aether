import { expect, test } from '@playwright/test';

test.describe('E1 — campaign picker', () => {
  test('picking the Launch template seeds all four formats and fills the brief', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');

    // Open the campaign rail section so the header pick button is visible.
    await page.locator('[data-rail-section="campaign"]').click();
    let flyout = page.locator('[data-rail-flyout="campaign"]');
    await expect(flyout).toBeVisible();

    // Fire the picker from the section's header action. Opening the picker
    // collapses the flyout so the dialog owns the outside-click surface.
    await flyout.locator('[data-testid="campaign-pick-open"]').click();

    const picker = page.locator('[data-testid="campaign-picker"]');
    await expect(picker).toBeVisible();

    // Pick the Launch template. Each card is a single icon + short label.
    await picker.locator('[data-testid="campaign-template-launch"]').click();
    await expect(picker).toBeHidden();

    // Re-open the campaign section to inspect the post-pick state.
    await page.locator('[data-rail-section="campaign"]').click();
    flyout = page.locator('[data-rail-flyout="campaign"]');
    await expect(flyout).toBeVisible();

    // Brief body is seeded and non-empty.
    const brief = flyout.locator('[data-testid="campaign-brief-textarea"]');
    await expect(brief).toBeVisible();
    const briefValue = await brief.inputValue();
    expect(briefValue.trim().length).toBeGreaterThan(0);

    // Launch template declares all four hero formats → campaign chips should
    // reflect that exact set (IG post, story, reel cover, LinkedIn).
    const formatChips = flyout
      .locator('[data-testid="campaign-formats"]')
      .locator('span');
    await expect(formatChips).toHaveCount(4);
    await expect(formatChips.nth(0)).toHaveText(/IG post/i);
    await expect(formatChips.nth(1)).toHaveText(/story/i);
    await expect(formatChips.nth(2)).toHaveText(/reel cover/i);
    await expect(formatChips.nth(3)).toHaveText(/LinkedIn/i);
  });

  test('AI propose flow shows a generated shape the creator can accept', async ({
    page,
  }) => {
    await page.route('**/api/campaigns/propose', async (route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          proposal: {
            name: 'Golden-hour drop',
            intent: 'Tease a slow-morning reset across story and reel cover.',
            formats: ['story', 'reel-cover'],
            tone: ['slow', 'cropped'],
            briefBody:
              'Tease the spring reset with two cropped golden-hour frames. Story first, reel cover second.',
          },
        }),
      });
    });

    await page.goto('/workspace/demo-ws');
    await page.locator('[data-rail-section="campaign"]').click();
    const flyout = page.locator('[data-rail-flyout="campaign"]');
    await flyout.locator('[data-testid="campaign-pick-open"]').click();

    const picker = page.locator('[data-testid="campaign-picker"]');
    await expect(picker).toBeVisible();
    await picker.locator('[data-testid="campaign-propose-generate"]').click();

    const result = picker.locator('[data-testid="campaign-propose-result"]');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Golden-hour drop');

    await picker.locator('[data-testid="campaign-propose-accept"]').click();
    await expect(picker).toBeHidden();

    // Re-open the campaign section to inspect the post-pick state.
    await page.locator('[data-rail-section="campaign"]').click();
    const flyoutAfter = page.locator('[data-rail-flyout="campaign"]');
    const brief = flyoutAfter.locator('[data-testid="campaign-brief-textarea"]');
    await expect(brief).toHaveValue(/golden-hour/i);
    const formatChips = flyoutAfter
      .locator('[data-testid="campaign-formats"]')
      .locator('span');
    await expect(formatChips).toHaveCount(2);
  });
});
