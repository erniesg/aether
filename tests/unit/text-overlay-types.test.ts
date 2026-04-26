import { describe, expect, it } from 'vitest';
import type { TextMaskTextStyle } from '@/lib/video/textMask';
import {
  asBCP47LocaleCode,
  type AetherTextPlacement,
  type BCP47LocaleCode,
  type TextOverlayLayer,
  type TextOverlayStyle,
} from '@/lib/text-overlay/types';

describe('text-overlay types (#67 / A3)', () => {
  it('TextOverlayStyle is a structural superset of TextMaskTextStyle (compile-time)', () => {
    // Any TextOverlayStyle instance must satisfy TextMaskTextStyle.
    const style: TextOverlayStyle = {
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 600,
      fontStyle: 'normal',
      letterSpacing: 0,
      lineHeight: 1.2,
      textAlign: 'center',
      color: '#111111',
      language: asBCP47LocaleCode('en'),
    };
    const narrowed: TextMaskTextStyle = style;
    expect(narrowed.fontFamily).toBe('Inter');
    expect(narrowed.fontSize).toBe(48);
    expect(narrowed.fontWeight).toBe(600);
    expect(narrowed.fontStyle).toBe('normal');
  });

  it('TextOverlayStyle exposes every TextMaskTextStyle field at runtime', () => {
    const style: TextOverlayStyle = {
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 600,
      fontStyle: 'italic',
      letterSpacing: 0.02,
      lineHeight: 1.1,
      textAlign: 'start',
      color: '#000',
      backgroundColor: '#fff',
      strokeWidth: 2,
      strokeColor: '#444',
      shadow: { blur: 6, offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.2)' },
      language: asBCP47LocaleCode('zh-Hans'),
    };
    const maskFields: (keyof TextMaskTextStyle)[] = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
    ];
    for (const field of maskFields) {
      expect(style[field]).toBeDefined();
    }
  });

  it('BCP47LocaleCode is distinct from string at the type level but assignable from string', () => {
    const en: BCP47LocaleCode = asBCP47LocaleCode('en');
    // @ts-expect-error — raw strings must go through the constructor.
    const zh: BCP47LocaleCode = 'zh-Hans';
    expect(en).toBe('en');
    expect(zh).toBe('zh-Hans');
  });
});

describe('text-overlay types — placement + layer shape (#67 / A4)', () => {
  it('AetherTextPlacement aspect overrides are per-AspectRatio partials', () => {
    const placement: AetherTextPlacement = {
      mode: 'smart',
      anchor: { normalizedX: 0.5, normalizedY: 0.1, relativeTo: 'safeZone' },
      rotation: 0,
      width: 0.8,
      aspectOverrides: {
        '9:16': { anchor: { normalizedX: 0.5, normalizedY: 0.92, relativeTo: 'safeZone' } },
        '16:9': { width: 0.6, rotation: 0 },
      },
    };
    expect(placement.aspectOverrides?.['9:16']?.anchor?.normalizedY).toBeCloseTo(0.92);
    expect(placement.aspectOverrides?.['16:9']?.width).toBe(0.6);
  });

  it('TextOverlayLayer carries provenance + protected ids so T6 / T11 drop in without a schema bump', () => {
    const en = asBCP47LocaleCode('en');
    const layer: TextOverlayLayer = {
      id: 'overlay_1',
      wsId: 'ws_1',
      artboardId: 'board_1',
      content: { [en]: 'Hello' } as Record<BCP47LocaleCode, string>,
      activeLanguage: en,
      style: {
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 600,
        fontStyle: 'normal',
        letterSpacing: 0,
        lineHeight: 1.2,
        textAlign: 'center',
        color: '#111',
        language: en,
      },
      placement: {
        mode: 'smart',
        anchor: { normalizedX: 0.5, normalizedY: 0.5, relativeTo: 'artboard' },
        rotation: 0,
        width: 'auto',
      },
      smartPlacement: true,
      protectedElementIds: ['hero-logo', 'hero-product'],
      createdAt: 0,
      updatedAt: 0,
      provenance: { capabilityRunId: 'run_1' },
    };
    expect(layer.protectedElementIds).toEqual(['hero-logo', 'hero-product']);
    expect(layer.provenance.capabilityRunId).toBe('run_1');
    expect(layer.smartPlacement).toBe(true);
  });
});
