import { expect, test, type Page } from '@playwright/test';

const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const BLUE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';

type SeededIds = { redId: string; blueId: string };

async function waitForCanvasReady(page: Page): Promise<void> {
  await expect(page.locator('.tl-container')).toBeVisible();
  await page
    .locator('.tl-container .tl-canvas, .tl-container .tl-svg-container')
    .first()
    .waitFor({ timeout: 15_000 });

  // Wait for window.editor to be attached by the Tldraw onMount handler.
  await page.waitForFunction(() => Boolean((window as { editor?: unknown }).editor), null, {
    timeout: 15_000,
  });
}

async function seedTwoImages(page: Page): Promise<SeededIds> {
  return await page.evaluate(
    ([redSrc, blueSrc]) => {
      type EditorLike = {
        createAssets: (assets: unknown[]) => unknown;
        createShape: (shape: unknown) => unknown;
        setSelectedShapes: (ids: string[]) => unknown;
        getShape: (id: string) => unknown;
      };
      const shim = window as unknown as {
        editor: EditorLike;
        tldraw?: {
          AssetRecordType: { createId: () => string };
          createShapeId: () => string;
        };
      };
      if (!shim.tldraw) throw new Error('tldraw helpers not exposed on window');
      const editor = shim.editor;
      const makeAssetId = shim.tldraw.AssetRecordType.createId;
      const makeShapeId = shim.tldraw.createShapeId;

      const redAssetId = makeAssetId();
      const blueAssetId = makeAssetId();
      const redShapeId = makeShapeId();
      const blueShapeId = makeShapeId();

      editor.createAssets([
        {
          id: redAssetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: 'e2e-red',
            src: redSrc,
            w: 1,
            h: 1,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        },
        {
          id: blueAssetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: 'e2e-blue',
            src: blueSrc,
            w: 1,
            h: 1,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      editor.createShape({
        id: redShapeId,
        type: 'image',
        x: 0,
        y: 0,
        props: { w: 200, h: 200, assetId: redAssetId },
      });
      editor.createShape({
        id: blueShapeId,
        type: 'image',
        x: 400,
        y: 80,
        props: { w: 200, h: 200, assetId: blueAssetId },
      });

      return { redId: redShapeId, blueId: blueShapeId };
    },
    [RED_PNG, BLUE_PNG] as const
  );
}

test.describe('selected image controls · opacity · order · align', () => {
  test('opacity slider writes through editor.updateShapes on a single-image selection', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await waitForCanvasReady(page);

    const { redId } = await seedTwoImages(page);
    await page.evaluate((id) => {
      const editor = (window as unknown as { editor: { setSelectedShapes: (ids: string[]) => unknown } }).editor;
      editor.setSelectedShapes([id]);
    }, redId);

    const slider = page.getByRole('slider', { name: /opacity/i });
    await expect(slider).toBeVisible();

    // Drive opacity directly — fireEvent.change equivalent on a range input.
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '40';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const opacity = await page.evaluate((id) => {
      const editor = (window as unknown as {
        editor: { getShape: (id: string) => { opacity?: number } | undefined };
      }).editor;
      return editor.getShape(id)?.opacity ?? null;
    }, redId);

    expect(opacity).not.toBeNull();
    expect(opacity as number).toBeCloseTo(0.4, 2);
  });

  test('align-left snaps two selected images to the same x coordinate', async ({ page }) => {
    await page.goto('/workspace/demo-ws');
    await waitForCanvasReady(page);

    const { redId, blueId } = await seedTwoImages(page);
    await page.evaluate(
      ([ids]) => {
        const editor = (window as unknown as {
          editor: { setSelectedShapes: (ids: string[]) => unknown };
        }).editor;
        editor.setSelectedShapes(ids);
      },
      [[redId, blueId]] as const
    );

    const alignLeft = page.getByRole('button', { name: /align left/i });
    await expect(alignLeft).toBeVisible();
    await alignLeft.click();

    const xs = await page.evaluate(
      ([ids]) => {
        const editor = (window as unknown as {
          editor: { getShape: (id: string) => { x?: number } | undefined };
        }).editor;
        return ids.map((id) => editor.getShape(id)?.x ?? null);
      },
      [[redId, blueId]] as const
    );

    expect(xs[0]).not.toBeNull();
    expect(xs[1]).not.toBeNull();
    expect(Math.abs((xs[0] as number) - (xs[1] as number))).toBeLessThan(0.5);
  });

  test('native tldraw image bubble menu does not render alongside aether strip', async ({
    page,
  }) => {
    await page.goto('/workspace/demo-ws');
    await waitForCanvasReady(page);

    const { redId } = await seedTwoImages(page);
    await page.evaluate((id) => {
      const editor = (window as unknown as { editor: { setSelectedShapes: (ids: string[]) => unknown } }).editor;
      editor.setSelectedShapes([id]);
    }, redId);

    await expect(page.getByRole('toolbar', { name: /selected image actions/i })).toBeVisible();
    // tldraw renders the native image bubble as a toolbar named "Image tools".
    await expect(page.getByRole('toolbar', { name: /image tools/i })).toHaveCount(0);
  });
});
