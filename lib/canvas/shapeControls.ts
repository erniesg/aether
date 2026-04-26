import type { Editor, TLShapeId } from 'tldraw';

export type OrderAction =
  | 'bring-forward'
  | 'bring-to-front'
  | 'send-backward'
  | 'send-to-back';

export type AlignAction =
  | 'left'
  | 'center-horizontal'
  | 'right'
  | 'top'
  | 'center-vertical'
  | 'bottom';

export type DistributeAction = 'horizontal' | 'vertical';

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function applyOpacity(editor: Editor, ids: TLShapeId[], opacity: number) {
  if (ids.length === 0) return;
  const next = clamp01(opacity);
  const partials: Array<{ id: TLShapeId; type: string; opacity: number }> = [];
  for (const id of ids) {
    const shape = editor.getShape(id) as { type?: string } | undefined;
    if (!shape || typeof shape.type !== 'string') continue;
    partials.push({ id, type: shape.type, opacity: next });
  }
  if (partials.length === 0) return;
  editor.updateShapes(partials as never);
}

export function applyOrder(editor: Editor, ids: TLShapeId[], action: OrderAction) {
  if (ids.length === 0) return;
  switch (action) {
    case 'bring-forward':
      editor.bringForward(ids);
      return;
    case 'bring-to-front':
      editor.bringToFront(ids);
      return;
    case 'send-backward':
      editor.sendBackward(ids);
      return;
    case 'send-to-back':
      editor.sendToBack(ids);
  }
}

export function applyAlign(editor: Editor, ids: TLShapeId[], action: AlignAction) {
  if (ids.length < 2) return;
  editor.alignShapes(ids, action);
}

export function applyDistribute(
  editor: Editor,
  ids: TLShapeId[],
  action: DistributeAction
) {
  if (ids.length < 2) return;
  editor.distributeShapes(ids, action);
}
