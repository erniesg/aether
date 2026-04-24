import { describe, expect, it } from 'vitest';
import { buildHyperframesDoubleExposureComposition } from '@/lib/video/hyperframesDoubleExposure';

describe('buildHyperframesDoubleExposureComposition', () => {
  it('returns a HyperFrames-compatible HTML composition for the image-backed variant', () => {
    const html = buildHyperframesDoubleExposureComposition({
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
      overlay: {
        title: 'Afterimage',
      },
    });

    expect(html).toContain('data-composition-id="afterimage-still"');
    expect(html).toContain('class="de-root de-look-classic"');
    expect(html).toContain('id="de-canvas"');
    expect(html).toContain('id="de-source-subject"');
    expect(html).toContain('id="de-source-atmosphere-0"');
    expect(html).toContain('data-animate-text="soft-blur-in"');
    expect(html).toContain('window.__timelines["afterimage-still"] = tl;');
  });

  it('can render a compare demo with the effect initially disabled', () => {
    const html = buildHyperframesDoubleExposureComposition({
      id: 'afterimage-compare',
      subject: {
        kind: 'image',
        url: './assets/subject.png',
      },
      exposure: {
        kind: 'video',
        url: './assets/city.mp4',
      },
      preview: {
        allowEffectToggle: true,
        effectInitiallyEnabled: false,
      },
      overlay: {
        title: 'Effect Toggle',
      },
    });

    expect(html).toContain('class="de-root de-look-cinematic de-effect-disabled"');
    expect(html).toContain('id="de-compare-toggle"');
    expect(html).toContain('Effect Off');
    expect(html).toContain('setEffectEnabled(false);');
  });
});
