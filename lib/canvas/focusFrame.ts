import type { Editor, TLShape } from 'tldraw';

/**
 * Return every frame shape on the current page, in document order. Frames are
 * tldraw's native artboard primitive; aether seeds four of them on load and
 * creators can add more. Used by the Focus lens to cycle through formats.
 */
export function getFrameShapes(editor: Editor): TLShape[] {
  return editor.getCurrentPageShapes().filter((s) => s.type === 'frame');
}

/**
 * Resolve the currently active frame from the creator's selection. Selecting
 * a frame uses it directly; selecting a child shape nested inside a frame
 * resolves back to the owning frame so composer targeting stays intuitive.
 */
export function getActiveFrameShape(editor: Editor): TLShape | null {
  const selected = editor.getOnlySelectedShape();
  if (!selected) return null;
  if (selected.type === 'frame') return selected;
  if (!selected.parentId) return null;
  const parent = editor.getShape(selected.parentId);
  return parent?.type === 'frame' ? parent : null;
}

/**
 * Focus a frame by its position in the document's frame list. Indices wrap
 * both directions so `-1` goes to the last frame and `len` goes back to 0.
 * Returns the resolved (wrapped) index, or `null` if the page has no frames.
 *
 * Uses tldraw's native `select` + `zoomToSelection` — no custom camera math.
 */
export function focusFrameAtIndex(editor: Editor, idx: number): number | null {
  const frames = getFrameShapes(editor);
  if (frames.length === 0) return null;
  const wrapped = ((idx % frames.length) + frames.length) % frames.length;
  editor.select(frames[wrapped].id);
  editor.zoomToSelection({ animation: { duration: 240 } });
  return wrapped;
}

/**
 * Zoom the camera to fit every frame on the page at once — the Canvas lens's
 * default panoramic view. Uses `selectAll` → `zoomToSelection` then releases
 * the group selection so the creator doesn't inherit it.
 */
export function zoomToAllFrames(editor: Editor): number {
  const frames = getFrameShapes(editor);
  if (frames.length === 0) return 0;
  editor.select(...frames.map((f) => f.id));
  editor.zoomToSelection({ animation: { duration: 240 } });
  editor.setSelectedShapes([]);
  return frames.length;
}
