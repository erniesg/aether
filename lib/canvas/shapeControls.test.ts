import { describe, expect, it, vi } from 'vitest';
import type { Editor } from 'tldraw';
import {
  applyAlign,
  applyDistribute,
  applyOpacity,
  applyOrder,
} from './shapeControls';

function makeMockEditor(shapeType = 'image') {
  return {
    updateShapes: vi.fn(),
    bringToFront: vi.fn(),
    bringForward: vi.fn(),
    sendBackward: vi.fn(),
    sendToBack: vi.fn(),
    alignShapes: vi.fn(),
    distributeShapes: vi.fn(),
    markHistoryStoppingPoint: vi.fn(),
    getShape: vi.fn((id: string) => ({ id, type: shapeType })),
  } as unknown as Editor & Record<string, ReturnType<typeof vi.fn>>;
}

describe('shapeControls · applyOpacity', () => {
  it('calls editor.updateShapes once per shape with top-level opacity', () => {
    const editor = makeMockEditor();
    applyOpacity(editor, ['shape:a', 'shape:b'] as never, 0.4);

    expect(editor.updateShapes).toHaveBeenCalledTimes(1);
    const call = (editor.updateShapes as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toEqual([
      { id: 'shape:a', type: 'image', opacity: 0.4 },
      { id: 'shape:b', type: 'image', opacity: 0.4 },
    ]);
  });

  it('clamps opacity into [0, 1]', () => {
    const editor = makeMockEditor();
    applyOpacity(editor, ['shape:a'] as never, 1.6);
    applyOpacity(editor, ['shape:a'] as never, -0.2);

    const calls = (editor.updateShapes as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0][0].opacity).toBe(1);
    expect(calls[1][0][0].opacity).toBe(0);
  });

  it('noops when no shapes are passed', () => {
    const editor = makeMockEditor();
    applyOpacity(editor, [] as never, 0.5);
    expect(editor.updateShapes).not.toHaveBeenCalled();
  });
});

describe('shapeControls · applyOrder', () => {
  it('maps each OrderAction onto the matching tldraw method with the given ids', () => {
    const editor = makeMockEditor();
    const ids = ['shape:a', 'shape:b'] as never;

    applyOrder(editor, ids, 'bring-forward');
    applyOrder(editor, ids, 'bring-to-front');
    applyOrder(editor, ids, 'send-backward');
    applyOrder(editor, ids, 'send-to-back');

    expect((editor.bringForward as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([[ids]]);
    expect((editor.bringToFront as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([[ids]]);
    expect((editor.sendBackward as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([[ids]]);
    expect((editor.sendToBack as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([[ids]]);
  });

  it('noops on empty selection', () => {
    const editor = makeMockEditor();
    applyOrder(editor, [] as never, 'bring-forward');
    expect(editor.bringForward).not.toHaveBeenCalled();
  });
});

describe('shapeControls · applyAlign / applyDistribute', () => {
  it('forwards the align operation string to editor.alignShapes', () => {
    const editor = makeMockEditor();
    const ids = ['shape:a', 'shape:b', 'shape:c'] as never;

    applyAlign(editor, ids, 'left');
    applyAlign(editor, ids, 'center-horizontal');
    applyAlign(editor, ids, 'right');
    applyAlign(editor, ids, 'top');
    applyAlign(editor, ids, 'center-vertical');
    applyAlign(editor, ids, 'bottom');

    expect((editor.alignShapes as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [ids, 'left'],
      [ids, 'center-horizontal'],
      [ids, 'right'],
      [ids, 'top'],
      [ids, 'center-vertical'],
      [ids, 'bottom'],
    ]);
  });

  it('requires at least two shapes for align', () => {
    const editor = makeMockEditor();
    applyAlign(editor, ['shape:a'] as never, 'left');
    expect(editor.alignShapes).not.toHaveBeenCalled();
  });

  it('forwards the distribute axis to editor.distributeShapes', () => {
    const editor = makeMockEditor();
    const ids = ['shape:a', 'shape:b', 'shape:c'] as never;

    applyDistribute(editor, ids, 'horizontal');
    applyDistribute(editor, ids, 'vertical');

    expect((editor.distributeShapes as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [ids, 'horizontal'],
      [ids, 'vertical'],
    ]);
  });

  it('requires at least two shapes for distribute', () => {
    const editor = makeMockEditor();
    applyDistribute(editor, ['shape:a'] as never, 'horizontal');
    expect(editor.distributeShapes).not.toHaveBeenCalled();
  });
});
