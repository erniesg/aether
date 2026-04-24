import { describe, expect, it } from 'vitest';
import {
  adjustSketchBrushSize,
  mapSketchBrushColorToTldraw,
  mapSketchBrushSizeToTldraw,
  normalizeVoiceBrushColor,
  normalizeVoiceBrushSize,
  normalizeVoiceBrushSizeDelta,
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
    expect(normalizeVoiceBrushColor('red')).toBe('red');
    expect(normalizeVoiceBrushColor('yellow')).toBe('yellow');
    expect(normalizeVoiceBrushColor('green')).toBe('green');
    expect(normalizeVoiceBrushColor('orange')).toBe('orange');
    expect(mapSketchBrushColorToTldraw('brand-primary')).toBe('light-blue');
    expect(mapSketchBrushColorToTldraw('brand-accent')).toBe('violet');
    expect(mapSketchBrushColorToTldraw('red')).toBe('red');
    expect(mapSketchBrushColorToTldraw('yellow')).toBe('yellow');
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

  it('adjusts brush thickness relatively for voice commands', () => {
    expect(normalizeVoiceBrushSizeDelta('thicker')).toBe('thicker');
    expect(normalizeVoiceBrushSizeDelta('thinner')).toBe('thinner');
    expect(normalizeVoiceBrushSizeDelta('huge')).toBeNull();
    expect(adjustSketchBrushSize('small', 'thicker')).toBe('medium');
    expect(adjustSketchBrushSize('medium', 'thicker')).toBe('large');
    expect(adjustSketchBrushSize('large', 'thicker')).toBe('large');
    expect(adjustSketchBrushSize('medium', 'thinner')).toBe('small');
    expect(adjustSketchBrushSize('small', 'thinner')).toBe('small');
  });
});
