export type PrimitiveTool = 'select' | 'hand' | 'draw' | 'text' | 'geo' | 'arrow';

export type VoiceSelectableTool = 'select' | 'hand' | 'draw' | 'sketch';

export type SketchBrushColor =
  | 'black'
  | 'white'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'brand-primary'
  | 'brand-accent';

export type VoiceBrushColor =
  | 'black'
  | 'white'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'brand_primary'
  | 'brand_accent';

export type SketchBrushSize = 'small' | 'medium' | 'large';
export type VoiceBrushSizeDelta = 'thinner' | 'thicker';
export type VoiceBrushStyleSize =
  | SketchBrushSize
  | 'thin'
  | 'thick'
  | 'thinner'
  | 'thicker'
  | 'smaller'
  | 'bigger'
  | 'larger';

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
  'red',
  'yellow',
  'green',
  'orange',
  'brand_primary',
  'brand_accent',
];

export const VOICE_BRUSH_SIZES: ReadonlyArray<SketchBrushSize> = [
  'small',
  'medium',
  'large',
];

export const VOICE_BRUSH_STYLE_SIZES: ReadonlyArray<VoiceBrushStyleSize> = [
  'small',
  'medium',
  'large',
  'thin',
  'thick',
  'thinner',
  'thicker',
  'smaller',
  'bigger',
  'larger',
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
    case 'red':
    case 'yellow':
    case 'green':
    case 'orange':
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

export function normalizeVoiceBrushSizeDelta(
  delta: unknown
): VoiceBrushSizeDelta | null {
  switch (delta) {
    case 'thinner':
    case 'thicker':
      return delta;
    default:
      return null;
  }
}

export function normalizeVoiceBrushStyleSize(
  size: unknown
): { size?: SketchBrushSize; delta?: VoiceBrushSizeDelta } | null {
  switch (size) {
    case 'small':
    case 'medium':
    case 'large':
      return { size };
    case 'thin':
      return { size: 'small' };
    case 'thick':
      return { size: 'large' };
    case 'thinner':
    case 'smaller':
      return { delta: 'thinner' };
    case 'thicker':
    case 'bigger':
    case 'larger':
      return { delta: 'thicker' };
    default:
      return null;
  }
}

export function adjustSketchBrushSize(
  current: SketchBrushSize,
  delta: VoiceBrushSizeDelta
): SketchBrushSize {
  const sizes: SketchBrushSize[] = ['small', 'medium', 'large'];
  const currentIndex = sizes.indexOf(current);
  const nextIndex =
    delta === 'thicker'
      ? Math.min(sizes.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
  return sizes[nextIndex] ?? current;
}

export function mapSketchBrushColorToTldraw(
  color: SketchBrushColor
):
  | 'black'
  | 'white'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'light-blue'
  | 'violet' {
  switch (color) {
    case 'black':
      return 'black';
    case 'white':
      return 'white';
    case 'blue':
      return 'blue';
    case 'red':
      return 'red';
    case 'yellow':
      return 'yellow';
    case 'green':
      return 'green';
    case 'orange':
      return 'orange';
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

export function mapSketchBrushColorToCss(color: SketchBrushColor): string {
  switch (color) {
    case 'black':
      return 'rgba(15, 23, 42, 0.94)';
    case 'white':
      return 'rgba(255, 255, 255, 0.94)';
    case 'blue':
      return 'rgba(37, 99, 235, 0.94)';
    case 'red':
      return 'rgba(220, 38, 38, 0.94)';
    case 'yellow':
      return 'rgba(234, 179, 8, 0.94)';
    case 'green':
      return 'rgba(22, 163, 74, 0.94)';
    case 'orange':
      return 'rgba(234, 88, 12, 0.94)';
    case 'brand-primary':
      return 'rgba(56, 189, 248, 0.94)';
    case 'brand-accent':
      return 'rgba(139, 92, 246, 0.94)';
  }
}

export function mapSketchBrushSizeToLiveInkWidth(
  size: SketchBrushSize
): number {
  switch (size) {
    case 'small':
      return 3;
    case 'medium':
      return 5;
    case 'large':
      return 8;
  }
}
