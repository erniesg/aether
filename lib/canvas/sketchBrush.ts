export type PrimitiveTool = 'select' | 'hand' | 'draw' | 'text' | 'geo' | 'arrow';

export type VoiceSelectableTool = 'select' | 'hand' | 'draw' | 'sketch';

export type SketchBrushColor =
  | 'black'
  | 'white'
  | 'blue'
  | 'brand-primary'
  | 'brand-accent';

export type VoiceBrushColor =
  | 'black'
  | 'white'
  | 'blue'
  | 'brand_primary'
  | 'brand_accent';

export type SketchBrushSize = 'small' | 'medium' | 'large';

export interface SketchBrushState {
  tool: PrimitiveTool;
  color: SketchBrushColor;
  size: SketchBrushSize;
}

export const DEFAULT_SKETCH_BRUSH_STATE: SketchBrushState = {
  tool: 'select',
  color: 'black',
  size: 'medium',
};

export const VOICE_SELECTABLE_TOOLS: ReadonlyArray<VoiceSelectableTool> = [
  'select',
  'hand',
  'draw',
  'sketch',
];

export const VOICE_BRUSH_COLORS: ReadonlyArray<VoiceBrushColor> = [
  'black',
  'white',
  'blue',
  'brand_primary',
  'brand_accent',
];

export const VOICE_BRUSH_SIZES: ReadonlyArray<SketchBrushSize> = [
  'small',
  'medium',
  'large',
];

export function normalizeVoiceSelectableTool(tool: unknown): PrimitiveTool | null {
  switch (tool) {
    case 'select':
    case 'hand':
    case 'draw':
      return tool;
    case 'sketch':
      return 'draw';
    default:
      return null;
  }
}

export function normalizeVoiceBrushColor(color: unknown): SketchBrushColor | null {
  switch (color) {
    case 'black':
    case 'white':
    case 'blue':
      return color;
    case 'brand_primary':
      return 'brand-primary';
    case 'brand_accent':
      return 'brand-accent';
    default:
      return null;
  }
}

export function normalizeVoiceBrushSize(size: unknown): SketchBrushSize | null {
  switch (size) {
    case 'small':
    case 'medium':
    case 'large':
      return size;
    default:
      return null;
  }
}

export function mapSketchBrushColorToTldraw(
  color: SketchBrushColor
): 'black' | 'white' | 'blue' | 'light-blue' | 'violet' {
  switch (color) {
    case 'black':
      return 'black';
    case 'white':
      return 'white';
    case 'blue':
      return 'blue';
    case 'brand-primary':
      return 'light-blue';
    case 'brand-accent':
      return 'violet';
  }
}

export function mapSketchBrushSizeToTldraw(
  size: SketchBrushSize
): 's' | 'm' | 'l' {
  switch (size) {
    case 'small':
      return 's';
    case 'medium':
      return 'm';
    case 'large':
      return 'l';
  }
}
