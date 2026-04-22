import { describe, expect, it } from 'vitest';
import { buildBackgroundFillDataUrl } from '@/lib/canvas/backgroundFill';
import { buildMaskedImageDataUrl } from '@/lib/segment/dataUrl';

describe('background fill data urls', () => {
  it('builds a solid fill svg data url', () => {
    const url = buildBackgroundFillDataUrl({
      width: 1080,
      height: 1350,
      fill: {
        mode: 'solid',
        colorA: '#112233',
        colorB: '#ffffff',
        opacity: 0.55,
      },
    });

    expect(url).toContain('data:image/svg+xml');
    expect(decodeURIComponent(url)).toContain('fill="#112233"');
    expect(decodeURIComponent(url)).toContain('fill-opacity="0.55"');
  });

  it('builds a gradient fill svg data url', () => {
    const url = buildBackgroundFillDataUrl({
      width: 1080,
      height: 1920,
      fill: {
        mode: 'gradient',
        colorA: '#ff6b6b',
        colorB: '#0f172a',
        opacity: 0.8,
        angle: 90,
      },
    });

    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('linearGradient');
    expect(decoded).toContain('stop-color="#ff6b6b"');
    expect(decoded).toContain('stop-color="#0f172a"');
    expect(decoded).toContain('rotate(90');
  });

  it('builds an inverted masked image data url', () => {
    const url = buildMaskedImageDataUrl({
      sourceDataUrl: 'data:image/png;base64,aaaa',
      maskDataUrl: 'data:image/png;base64,bbbb',
      width: 100,
      height: 100,
      invertMask: true,
    });

    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('invertMask');
    expect(decoded).toContain('mask="url(#cutoutMask)"');
  });
});
