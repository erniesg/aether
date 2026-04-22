import { describe, expect, it, vi } from 'vitest';
import {
  dispatchFanOut,
  dropImageInFrame,
  pickAspectRatio,
  type FrameTarget,
} from './fanOut';

describe('fanOut · pickAspectRatio', () => {
  it('picks 1:1 for a square', () => {
    expect(pickAspectRatio(1080, 1080)).toBe('1:1');
  });

  it('picks 4:5 for IG Post 1080×1350', () => {
    expect(pickAspectRatio(1080, 1350)).toBe('4:5');
  });

  it('picks 9:16 for Story / Reel 1080×1920', () => {
    expect(pickAspectRatio(1080, 1920)).toBe('9:16');
  });

  it('picks 16:9 for LinkedIn 1200×627 (closer than 3:2)', () => {
    // 1200/627 = 1.913; 16:9 = 1.778; 3:2 = 1.5; 16:9 wins.
    expect(pickAspectRatio(1200, 627)).toBe('16:9');
  });

  it('picks 3:4 for portrait 1080×1440', () => {
    expect(pickAspectRatio(1080, 1440)).toBe('3:4');
  });

  it('picks 4:3 for landscape 1440×1080', () => {
    expect(pickAspectRatio(1440, 1080)).toBe('4:3');
  });

  it('defaults to 1:1 for zero / invalid dimensions', () => {
    expect(pickAspectRatio(0, 0)).toBe('1:1');
    expect(pickAspectRatio(100, 0)).toBe('1:1');
  });
});

type MockEditor = {
  getShape: ReturnType<typeof vi.fn>;
  createAssets: ReturnType<typeof vi.fn>;
  createShape: ReturnType<typeof vi.fn>;
  reparentShapes: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
};

function makeEditorWithFrame(frameId: string) {
  const editor: MockEditor = {
    getShape: vi.fn(() => ({
      id: frameId,
      type: 'frame',
      x: 100,
      y: 200,
      props: { w: 1080, h: 1350, name: 'IG Post' },
    })),
    createAssets: vi.fn(),
    createShape: vi.fn(),
    reparentShapes: vi.fn(),
    select: vi.fn(),
  };
  return editor;
}

describe('fanOut · dropImageInFrame (tldraw-native parenting)', () => {
  it('creates an asset + image shape sized to the frame and reparents it under the frame', () => {
    const editor = makeEditorWithFrame('shape:ig-post');
    const shapeId = dropImageInFrame(editor as never, 'shape:ig-post', {
      url: 'https://example.com/x.png',
      width: 1024,
      height: 1280,
      mimeType: 'image/png',
      label: 'prompt A',
    });

    expect(typeof shapeId).toBe('string');
    expect(editor.createAssets).toHaveBeenCalledTimes(1);
    expect(editor.createShape).toHaveBeenCalledTimes(1);

    const shape = editor.createShape.mock.calls[0]![0];
    expect(shape.type).toBe('image');
    // The image fills the frame — same bounds, same position.
    expect(shape.x).toBe(100);
    expect(shape.y).toBe(200);
    expect(shape.props.w).toBe(1080);
    expect(shape.props.h).toBe(1350);

    // Reparent makes the image a tldraw-native child of the frame, so
    // moving the frame moves the image with it and z-order stays sensible.
    expect(editor.reparentShapes).toHaveBeenCalledTimes(1);
    const [ids, parentId] = editor.reparentShapes.mock.calls[0]!;
    expect(ids).toEqual([shape.id]);
    expect(parentId).toBe('shape:ig-post');
  });

  it('no-ops when the frame id does not resolve to a shape', () => {
    const editor: MockEditor = {
      getShape: vi.fn(() => undefined),
      createAssets: vi.fn(),
      createShape: vi.fn(),
      reparentShapes: vi.fn(),
      select: vi.fn(),
    };
    const shapeId = dropImageInFrame(editor as never, 'shape:missing', {
      url: 'x',
      width: 10,
      height: 10,
    });
    expect(shapeId).toBeNull();
    expect(editor.createShape).not.toHaveBeenCalled();
  });
});

describe('fanOut · dispatchFanOut (orchestration)', () => {
  it('calls perFrame once per frame with the matching aspect ratio', async () => {
    const frames: FrameTarget[] = [
      { id: 'shape:a', w: 1080, h: 1350 },
      { id: 'shape:b', w: 1080, h: 1920 },
      { id: 'shape:c', w: 1200, h: 627 },
    ];
    const perFrame = vi.fn<(t: FrameTarget, ratio: string) => Promise<void>>(async () => {});

    await dispatchFanOut(frames, perFrame);

    expect(perFrame).toHaveBeenCalledTimes(3);
    expect(perFrame.mock.calls[0]).toEqual([frames[0], '4:5']);
    expect(perFrame.mock.calls[1]).toEqual([frames[1], '9:16']);
    expect(perFrame.mock.calls[2]).toEqual([frames[2], '16:9']);
  });

  it('isolates per-frame failures — one rejection does not cancel the others', async () => {
    const frames: FrameTarget[] = [
      { id: 'shape:a', w: 1080, h: 1080 },
      { id: 'shape:b', w: 1080, h: 1080 },
      { id: 'shape:c', w: 1080, h: 1080 },
    ];
    const perFrame = vi.fn(async (t: FrameTarget) => {
      if (t.id === 'shape:b') throw new Error('boom');
    });

    const results = await dispatchFanOut(frames, perFrame);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(perFrame).toHaveBeenCalledTimes(3);
  });

  it('returns an empty array when given no frames — no work, no crash', async () => {
    const perFrame = vi.fn();
    const results = await dispatchFanOut([], perFrame);
    expect(results).toEqual([]);
    expect(perFrame).not.toHaveBeenCalled();
  });
});
