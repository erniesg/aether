import { describe, expect, it } from 'vitest';
import { buildHyperframesTextMaskComposition } from '@/lib/video/hyperframes';

describe('buildHyperframesTextMaskComposition', () => {
  it('returns a HyperFrames-compatible HTML composition', () => {
    const html = buildHyperframesTextMaskComposition({
      id: 'intro-mask',
      text: 'aether',
      media: {
        kind: 'video',
        url: './assets/intro.mp4',
      },
      durationSec: 4,
      aspectRatio: '9:16',
    });

    expect(html).toContain('data-composition-id="intro-mask"');
    expect(html).toContain('class="hf-layer hf-mask-fill hf-mask-shell"');
    expect(html).toContain('class="hf-media hf-bg-media hf-autoplay"');
    expect(html).toContain('data-duration="4"');
    expect(html).toContain('window.__timelines["intro-mask"] = tl;');
    expect(html).toContain('AETHER // HACKATHON OPENING');
    expect(html).toContain('-webkit-mask-image: url("data:image/svg+xml');
    expect(html).toContain('requestAnimationFrame(syncPreview)');
  });

  it('renders custom overlay copy when provided', () => {
    const html = buildHyperframesTextMaskComposition({
      text: 'the machine\nafter the muse',
      title: 'Image Mask Study',
      media: {
        kind: 'image',
        url: './assets/muse.png',
      },
      overlay: {
        kicker: 'AETHER // IMAGE MASK STUDY',
        footerTitle: 'The Machine After The Muse',
        footerBody: 'Static artwork can also drive the same masked-text treatment.',
      },
    });

    expect(html).toContain('AETHER // IMAGE MASK STUDY');
    expect(html).toContain('The Machine After The Muse');
    expect(html).toContain('Static artwork can also drive the same masked-text treatment.');
  });

  it('can render a static compare view with a mask toggle', () => {
    const html = buildHyperframesTextMaskComposition({
      text: 'compare mode',
      media: {
        kind: 'image',
        url: './assets/muse.png',
      },
      preview: {
        motionEnabled: false,
        allowMaskToggle: true,
        maskInitiallyEnabled: false,
      },
    });

    expect(html).toContain('class="hf-root hf-mask-disabled"');
    expect(html).toContain('id="hf-mask-toggle"');
    expect(html).toContain('Mask Off');
    expect(html).toContain('const motionEnabled = false;');
    expect(html).toContain('const allowMaskToggle = true;');
    expect(html).toContain('else setStaticPreview();');
  });

  it('switches cleanly to an image-backed composition', () => {
    const html = buildHyperframesTextMaskComposition({
      text: 'launch day',
      media: {
        kind: 'image',
        url: './assets/hero.jpg',
      },
    });

    expect(html).toContain('<img');
    expect(html).toContain('-webkit-mask-image: url("data:image/svg+xml');
    expect(html).toContain('./assets/hero.jpg');
  });
});
