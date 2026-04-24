import { describe, expect, it } from 'vitest';
import { createDoubleExposureSceneSpec } from '@/lib/video/doubleExposure';

describe('createDoubleExposureSceneSpec', () => {
  it('builds a reusable image-backed double-exposure scene', () => {
    const spec = createDoubleExposureSceneSpec({
      id: 'afterimage-still',
      title: 'Afterimage Still',
      look: 'classic',
      subject: {
        kind: 'image',
        url: './assets/subject.png',
        fit: 'contain',
      },
      exposure: {
        kind: 'image',
        url: './assets/city.png',
      },
      atmosphere: [
        {
          kind: 'video',
          url: './assets/lightleak.mp4',
        },
      ],
      aspectRatio: '16:9',
    });

    expect(spec.kind).toBe('double-exposure');
    expect(spec.size).toEqual({ w: 1920, h: 1080 });
    expect(spec.payload.look).toBe('classic');
    expect(spec.assets.map((asset) => asset.id)).toEqual([
      'subject-media',
      'exposure-media',
      'background-media',
      'atmosphere-media-1',
    ]);
    expect(spec.payload.background.url).toBe('./assets/city.png');
    expect(spec.payload.grade.backgroundFill).toBe('#f5f2eb');
    expect(spec.payload.overlay.titleEffectId).toBe('soft-blur-in');
    expect(spec.payload.keying.threshold).toBe(12);
  });

  it('supports a video-backed exposure with compare mode enabled', () => {
    const spec = createDoubleExposureSceneSpec({
      subject: {
        kind: 'image',
        url: './assets/subject.png',
      },
      exposure: {
        kind: 'video',
        url: './assets/city.mp4',
        posterUrl: './assets/city.jpg',
      },
      background: {
        kind: 'image',
        url: './assets/city-still.png',
      },
      preview: {
        allowEffectToggle: true,
        effectInitiallyEnabled: false,
      },
      layout: {
        subject: {
          anchorX: 0.78,
          offsetXPx: -24,
        },
      },
      animation: {
        introDurationSec: 0.9,
      },
    });

    expect(spec.payload.exposure.kind).toBe('video');
    expect(spec.payload.preview.allowEffectToggle).toBe(true);
    expect(spec.payload.preview.effectInitiallyEnabled).toBe(false);
    expect(spec.payload.layout.subject.anchorX).toBe(0.78);
    expect(spec.payload.animation.introDurationSec).toBe(0.9);
  });
});
