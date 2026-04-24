import { expect, test } from '@playwright/test';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=',
  'base64'
);

const MOCK_HTML = '<!doctype html><div data-composition-id="hackathon-intro">mock motion</div>';

function mockMotionArtifact(title: string) {
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
        title,
        kind: 'text-mask',
        durationSec: 4,
        size: { w: 1920, h: 1080 },
      },
      latencyMs: 12,
    },
  };
}

async function pasteTinyPngIntoComposer(page: import('@playwright/test').Page) {
  await page.getByPlaceholder('describe the generation…').focus();
  await page.evaluate((base64) => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="describe the generation…"]'
    );
    if (!textarea) throw new Error('composer textarea not found');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const file = new File([bytes], 'pasted-ref.png', { type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(file);
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
  }, TINY_PNG.toString('base64'));
}

test.describe('motion artifact generation', () => {
  test('a demo intro prompt creates a visible motion preview with sound metadata', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    await page
      .getByPlaceholder('describe the generation…')
      .fill('Introduce me as an AI Engineer based in Singapore.');
    await page.getByRole('button', { name: /^generate$/i }).click();

    const preview = page.getByRole('region', { name: /motion artifact/i });
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview).toContainText(/sound/i);
    await expect(preview).toContainText(/hyperframes/i);
    await expect(
      preview.frameLocator('iframe').locator('[data-composition-id="hackathon-intro"]')
    ).toBeVisible();
  });

  test('a pasted composer reference becomes text-mask media and run provenance', async ({
    page,
  }) => {
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
        body: JSON.stringify(mockMotionArtifact('Reference Motion Intro')),
      });
    });

    await page.goto('/workspace/demo-ws');
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    await pasteTinyPngIntoComposer(page);
    await expect(
      page.getByRole('button', {
        name: /input set · 1 ad-hoc reference image attached/i,
      })
    ).toBeVisible();

    await page
      .getByPlaceholder('describe the generation…')
      .fill('Create an intro motion for Aether.');
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
    await expect(run.locator('[data-testid="run-source-ref"]')).toBeVisible();
  });

  test('two composer references become double-exposure subject and exposure inputs', async ({
    page,
  }) => {
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
        body: JSON.stringify(mockMotionArtifact('Double Exposure Intro')),
      });
    });

    await page.goto('/workspace/demo-ws');
    await expect(page.getByText('canvas · loading tldraw…')).toBeHidden({
      timeout: 30_000,
    });

    await pasteTinyPngIntoComposer(page);
    await pasteTinyPngIntoComposer(page);
    await expect(
      page.getByRole('button', {
        name: /input set · 2 ad-hoc reference images attached/i,
      })
    ).toBeVisible();

    await page
      .getByPlaceholder('describe the generation…')
      .fill('Double exposure of Ernie against Mount Everest.');
    await page.getByRole('button', { name: /^generate$/i }).click();

    await expect(page.getByRole('region', { name: /motion artifact/i })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      scene: {
        kind: 'double-exposure',
        subject: {
          kind: 'image',
          url: expect.stringMatching(/^data:image\/png;base64,/),
        },
        exposure: {
          kind: 'image',
          url: expect.stringMatching(/^data:image\/png;base64,/),
        },
      },
    });
  });
});
