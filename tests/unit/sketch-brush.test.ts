import { describe, expect, it } from 'vitest';
import {
  mapSketchBrushColorToTldraw,
  mapSketchBrushSizeToTldraw,
  normalizeVoiceBrushColor,
  normalizeVoiceBrushSize,
  normalizeVoiceSelectableTool,
} from '@/lib/canvas/sketchBrush';

describe('sketch brush helpers', () => {
  it('normalizes voice aliases onto concrete canvas tools', () => {
    expect(normalizeVoiceSelectableTool('sketch')).toBe('draw');
    expect(normalizeVoiceSelectableTool('draw')).toBe('draw');
    expect(normalizeVoiceSelectableTool('select')).toBe('select');
    expect(normalizeVoiceSelectableTool('tone')).toBeNull();
  });

  it('maps the bounded brush palette onto distinct tldraw color tokens', () => {
    expect(normalizeVoiceBrushColor('brand_primary')).toBe('brand-primary');
    expect(normalizeVoiceBrushColor('brand_accent')).toBe('brand-accent');
    expect(mapSketchBrushColorToTldraw('brand-primary')).toBe('light-blue');
    expect(mapSketchBrushColorToTldraw('brand-accent')).toBe('violet');
  });

  it('maps voice brush sizes onto supported tldraw size tokens', () => {
    expect(normalizeVoiceBrushSize('small')).toBe('small');
    expect(normalizeVoiceBrushSize('medium')).toBe('medium');
    expect(normalizeVoiceBrushSize('large')).toBe('large');
    expect(normalizeVoiceBrushSize('xl')).toBeNull();
    expect(mapSketchBrushSizeToTldraw('small')).toBe('s');
    expect(mapSketchBrushSizeToTldraw('medium')).toBe('m');
    expect(mapSketchBrushSizeToTldraw('large')).toBe('l');
  });
});
