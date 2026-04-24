import { describe, expect, it } from 'vitest';
import { buildTextMaskDataUrl, createTextMaskSceneSpec } from '@/lib/video/textMask';

describe('createTextMaskSceneSpec', () => {
  it('builds a reusable scene spec for masked video intros', () => {
    const spec = createTextMaskSceneSpec({
      text: 'aether\nhackathon',
      media: {
        kind: 'video',
        url: 'https://cdn.example.com/intro.mp4',
        posterUrl: 'https://cdn.example.com/intro.jpg',
      },
      aspectRatio: '16:9',
      durationSec: 5,
    });

    expect(spec.kind).toBe('text-mask');
    expect(spec.assets[0]).toMatchObject({
      kind: 'video',
      url: 'https://cdn.example.com/intro.mp4',
      posterUrl: 'https://cdn.example.com/intro.jpg',
    });
    expect(spec.size).toEqual({ w: 1920, h: 1080 });
    expect(spec.payload.lines).toEqual(['AETHER', 'HACKATHON']);
    expect(spec.payload.maskDataUrl).toContain('data:image/svg+xml');
    expect(spec.payload.styles.maskedMedia.WebkitMaskImage).toContain('data:image/svg+xml');
  });

  it('supports the same effect over a still image', () => {
    const spec = createTextMaskSceneSpec({
      text: ['launch', 'day'],
      media: {
        kind: 'image',
        url: 'https://cdn.example.com/hero.jpg',
      },
      aspectRatio: '4:5',
    });

    expect(spec.assets[0].kind).toBe('image');
    expect(spec.size).toEqual({ w: 1080, h: 1350 });
    expect(spec.payload.media.kind).toBe('image');
    expect(spec.payload.styles.backgroundMedia.objectFit).toBe('cover');
  });

  it('treats literal slash-n input like a line break for CLI usage', () => {
    const spec = createTextMaskSceneSpec({
      text: 'aether\\nhackathon',
      media: {
        kind: 'video',
        url: 'https://cdn.example.com/intro.mp4',
      },
    });

    expect(spec.payload.lines).toEqual(['AETHER', 'HACKATHON']);
  });
});

describe('buildTextMaskDataUrl', () => {
  it('encodes the SVG mask with the provided lines', () => {
    const { svg, dataUrl } = buildTextMaskDataUrl(
      ['HELLO', 'WORLD'],
      { w: 1080, h: 1920 },
      {
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 700,
        fontSizePx: 220,
        lineHeight: 0.92,
        lineHeightPx: 202,
        letterSpacingEm: -0.03,
        letterSpacingPx: -6.6,
        textTransform: 'uppercase',
        strokeColor: 'rgba(255,255,255,0.88)',
        strokeWidthPx: 8,
      }
    );

    expect(svg).toContain('HELLO');
    expect(svg).toContain('WORLD');
    expect(dataUrl).toContain(encodeURIComponent('HELLO'));
    expect(dataUrl).toContain('data:image/svg+xml');
  });
});
