import { describe, expect, it, vi } from 'vitest';
import {
  focusFrameAtIndex,
  getActiveFrameShape,
  getFrameShapes,
  zoomToAllFrames,
} from './focusFrame';

type MockShape = {
  id: string;
  type: 'frame' | 'image';
  parentId?: string;
};
type MockEditor = {
  getCurrentPageShapes: ReturnType<typeof vi.fn>;
  getOnlySelectedShape: ReturnType<typeof vi.fn>;
  getShape: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  zoomToSelection: ReturnType<typeof vi.fn>;
  setSelectedShapes: ReturnType<typeof vi.fn>;
};

function makeEditor(shapes: MockShape[], selected?: MockShape | null): MockEditor {
  return {
    getCurrentPageShapes: vi.fn(() => shapes),
    getOnlySelectedShape: vi.fn(() => selected ?? null),
    getShape: vi.fn((id: string) => shapes.find((shape) => shape.id === id)),
    select: vi.fn(),
    zoomToSelection: vi.fn(),
    setSelectedShapes: vi.fn(),
  };
}

const FRAMES: MockShape[] = [
  { id: 'shape:ig-post', type: 'frame' },
  { id: 'shape:story', type: 'frame' },
  { id: 'shape:reel', type: 'frame' },
  { id: 'shape:linkedin', type: 'frame' },
];

describe('focusFrame · tldraw-native frame focus + zoom', () => {
  it('getFrameShapes filters to frames, ignoring other shape types', () => {
    const editor = makeEditor([
      ...FRAMES,
      { id: 'shape:img-1', type: 'image' },
      { id: 'shape:img-2', type: 'image' },
    ]);
    const frames = getFrameShapes(editor as never);
    expect(frames).toHaveLength(4);
    expect(frames.every((f) => f.type === 'frame')).toBe(true);
  });

  it('focusFrameAtIndex selects the target frame and zooms to selection', () => {
    const editor = makeEditor(FRAMES);
    const idx = focusFrameAtIndex(editor as never, 1);

    expect(idx).toBe(1);
    expect(editor.select).toHaveBeenCalledWith('shape:story');
    expect(editor.zoomToSelection).toHaveBeenCalledTimes(1);
  });

  it('focusFrameAtIndex wraps positive overflow (idx === len → 0, idx === len+1 → 1)', () => {
    const editor = makeEditor(FRAMES);
    expect(focusFrameAtIndex(editor as never, FRAMES.length)).toBe(0);
    expect(focusFrameAtIndex(editor as never, FRAMES.length + 1)).toBe(1);
  });

  it('focusFrameAtIndex wraps negative overflow (idx === -1 → len-1)', () => {
    const editor = makeEditor(FRAMES);
    expect(focusFrameAtIndex(editor as never, -1)).toBe(FRAMES.length - 1);
    expect(focusFrameAtIndex(editor as never, -2)).toBe(FRAMES.length - 2);
  });

  it('focusFrameAtIndex returns null without touching the editor when no frames exist', () => {
    const editor = makeEditor([{ id: 'shape:img', type: 'image' }]);
    expect(focusFrameAtIndex(editor as never, 0)).toBeNull();
    expect(editor.select).not.toHaveBeenCalled();
    expect(editor.zoomToSelection).not.toHaveBeenCalled();
  });

  it('getActiveFrameShape returns the selected frame directly', () => {
    const selected = FRAMES[1]!;
    const editor = makeEditor(FRAMES, selected);
    expect(getActiveFrameShape(editor as never)?.id).toBe('shape:story');
  });

  it('getActiveFrameShape resolves the parent frame when a child image is selected', () => {
    const image = {
      id: 'shape:image-inside-story',
      type: 'image' as const,
      parentId: 'shape:story',
    };
    const editor = makeEditor([...FRAMES, image], image);
    expect(getActiveFrameShape(editor as never)?.id).toBe('shape:story');
  });

  it('zoomToAllFrames selects all frames, zooms, then releases selection', () => {
    const editor = makeEditor(FRAMES);
    const count = zoomToAllFrames(editor as never);

    expect(count).toBe(FRAMES.length);
    expect(editor.select).toHaveBeenCalledTimes(1);
    expect(editor.select).toHaveBeenCalledWith(
      'shape:ig-post',
      'shape:story',
      'shape:reel',
      'shape:linkedin'
    );
    expect(editor.zoomToSelection).toHaveBeenCalledTimes(1);
    expect(editor.setSelectedShapes).toHaveBeenCalledWith([]);
  });

  it('zoomToAllFrames no-ops cleanly on an empty page', () => {
    const editor = makeEditor([]);
    expect(zoomToAllFrames(editor as never)).toBe(0);
    expect(editor.select).not.toHaveBeenCalled();
  });
});
