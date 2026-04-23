import {
  DefaultColorStyle,
  DefaultSizeStyle,
  type Editor,
} from 'tldraw';
import {
  mapSketchBrushColorToTldraw,
  mapSketchBrushSizeToTldraw,
  type PrimitiveTool,
  type SketchBrushState,
} from './sketchBrush';

export function applySketchBrushStyles(
  editor: Editor,
  brush: Pick<SketchBrushState, 'color' | 'size'>
) {
  editor.setStyleForSelectedShapes(
    DefaultColorStyle,
    mapSketchBrushColorToTldraw(brush.color)
  );
  editor.setStyleForNextShapes(
    DefaultColorStyle,
    mapSketchBrushColorToTldraw(brush.color)
  );
  editor.setStyleForSelectedShapes(
    DefaultSizeStyle,
    mapSketchBrushSizeToTldraw(brush.size)
  );
  editor.setStyleForNextShapes(
    DefaultSizeStyle,
    mapSketchBrushSizeToTldraw(brush.size)
  );
}

export function applyPrimitiveTool(editor: Editor, tool: PrimitiveTool) {
  editor.setCurrentTool(tool);
}
