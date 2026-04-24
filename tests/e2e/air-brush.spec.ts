import { expect, test } from '@playwright/test';

const MOCK_HTML = '<!doctype html><div data-composition-id="hackathon-intro">mock motion</div>';

function mockMotionArtifact() {
  return {
    ok: true,
    provider: {
      id: 'hyperframes',
      model: 'hyperframes-html-v1',
    },
    artifact: {
      kind: 'html-composition',
      mimeType: 'text/html',
      html: MOCK_HTML,
      url: `data:text/html;charset=utf-8,${encodeURIComponent(MOCK_HTML)}`,
      width: 1920,
      height: 1080,
      durationSec: 4,
      audioIncluded: true,
    },
    result: {
      sceneSpec: {
        title: 'Captured Motion Intro',
        kind: 'text-mask',
        durationSec: 4,
        size: { w: 1920, h: 1080 },
      },
      latencyMs: 12,
    },
  };
}

test.describe('air brush input', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 24;
            const ctx = canvas.getContext('2d');
            ctx?.fillRect(0, 0, canvas.width, canvas.height);
            return canvas.captureStream(5);
          },
        },
      });
    });
  });

  test('toolbar toggle enters sketch mode and keeps camera/fallback preview visible', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /air brush · off/i }).click();

    await expect(page.getByRole('button', { name: /air brush · on/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: /sketch tool/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByLabel('air brush camera preview')).toBeVisible();
    await expect(page.getByText(/air brush · (camera|pointer fallback)/i)).toBeVisible();
  });

  test('captured camera frame flows into motion generation refs', async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route('**/api/video/generate', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMotionArtifact()),
      });
    });

    await page.goto('/workspace/demo-ws');
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    await page.getByRole('button', { name: /air brush · off/i }).click();
    await expect(page.getByLabel('air brush camera preview')).toBeVisible();
    await page.waitForFunction(() => {
      const video = document.querySelector<HTMLVideoElement>(
        'video[aria-label="air brush camera preview"]'
      );
      return Boolean(video && video.readyState >= 2);
    });

    await page
      .getByRole('button', { name: /capture air brush reference/i })
      .click();
    await expect(
      page.getByRole('button', {
        name: /input set · 1 ad-hoc reference image attached/i,
      })
    ).toBeVisible();

    await page
      .getByPlaceholder('describe the generation…')
      .fill('Create an intro motion from this capture.');
    await page.getByRole('button', { name: /^generate$/i }).click();

    const preview = page.getByRole('region', { name: /motion artifact/i });
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-testid="motion-source-ref"]')).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      scene: {
        kind: 'text-mask',
        media: {
          kind: 'image',
          url: expect.stringMatching(/^data:image\/png;base64,/),
        },
      },
    });

    await page.getByRole('button', { name: /all generations/i }).click();
    const run = page.locator('[data-tool="video-gen"]').first();
    await expect(run).toHaveAttribute('data-artifact-kind', 'video');
    await expect(run).toHaveAttribute('data-input-ref-count', '1');
    await expect(run).toHaveAttribute('data-output-ref-count', '1');
  });
});
