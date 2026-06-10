/**
 * Rendering behaviour shared by the four templates: genericity across events,
 * format fan-out, escaping of event-supplied text, and determinism.
 */
import { describe, expect, it } from 'vitest';
import {
  RECAP_FORMATS,
  RECAP_TEMPLATES,
  renderQuoteCascade,
  renderRecapVideo,
  type RecapFormat,
  type RecapVideoData,
} from './index';
import aie2026 from './fixtures/aie-2026.recap';
import devsummit2026 from './fixtures/devsummit-2026.recap';

const FORMATS: RecapFormat[] = ['vertical', 'square', 'landscape'];

describe('event-agnostic rendering', () => {
  it('renders every template for both fixture events', () => {
    for (const data of [aie2026, devsummit2026]) {
      for (const t of RECAP_TEMPLATES) {
        const html = t.render(data);
        expect(html).toContain('<!doctype html>');
        expect(html).toContain('window.__timelines["main"] = tl;');
      }
    }
  });

  it('surfaces no AIE string when rendering the DevSummit fixture', () => {
    for (const t of RECAP_TEMPLATES) {
      expect(t.render(devsummit2026)).not.toMatch(/aie/i);
    }
  });

  it('throws a named error when the required slice is missing', () => {
    const bare: RecapVideoData = { event: aie2026.event };
    for (const t of RECAP_TEMPLATES) {
      expect(() => t.render(bare)).toThrow(new RegExp(`requires data\\.${t.requires}`));
    }
  });
});

describe('format fan-out', () => {
  it('stamps each format’s canvas into the document', () => {
    for (const t of RECAP_TEMPLATES) {
      for (const format of FORMATS) {
        const html = t.render(aie2026, { format });
        const { width, height } = RECAP_FORMATS[format];
        expect(html).toContain(`data-width="${width}"`);
        expect(html).toContain(`data-height="${height}"`);
        expect(html).toContain(`width: ${width}px; height: ${height}px;`);
      }
    }
  });

  it('default render equals an explicit vertical render', () => {
    for (const t of RECAP_TEMPLATES) {
      expect(t.render(aie2026)).toBe(t.render(aie2026, { format: 'vertical' }));
    }
  });

  it('scales the by-the-numbers figure down for short formats', () => {
    const vertical = renderRecapVideo('by-the-numbers', aie2026);
    const landscape = renderRecapVideo('by-the-numbers', aie2026, {
      format: 'landscape',
    });
    // First stage of four: 280px at the 1920-tall reference, 158px at 1080.
    expect(vertical).toContain('font-size: 280px;');
    expect(landscape).toContain('font-size: 158px;');
  });

  it('keeps the photo-mosaic grid inside the short landscape stage', () => {
    const vertical = renderRecapVideo('photo-mosaic', aie2026);
    const landscape = renderRecapVideo('photo-mosaic', aie2026, {
      format: 'landscape',
    });
    // 3×3 grid: 276px cells at the vertical reference (hand-tuned layout),
    // height-bounded 151px cells at 1080 tall.
    expect(vertical).toContain('repeat(3, 276px)');
    expect(landscape).toContain('repeat(3, 151px)');
  });
});

describe('escaping of event-supplied text', () => {
  const hostile: RecapVideoData = {
    event: {
      eventId: 'hostile-2026',
      displayName: '<script>alert(1)</script>',
      tag: '<b>tag</b>',
      locationDate: '"quoted" & <em>dated</em>',
    },
    atlas: {
      lanes: [{ label: '<img src=x onerror=alert(1)>', nodeCount: 2 }],
      storyCount: 2,
      caption: ['<svg/onload=alert(1)>', 'one event.'],
    },
    funnel: [
      {
        label: '<script>x</script>',
        value: 1,
        format: 'integer',
        descriptor: 'a **bold** <claim>',
        fill: 0.5,
        scope: '<50%>',
        footerLeft: '<left>',
        footerRight: '<right>',
      },
    ],
    quotes: [
      {
        text: '</script><img src=x onerror=alert(1)>',
        technique: 'letter-cascade',
        who: '<who>',
        ctx: '<ctx>',
      },
      {
        text: 'breakout </script> attempt',
        technique: 'word-slam',
        accentWord: 'attempt',
        who: 'w',
        ctx: 'c',
      },
    ],
    mosaic: {
      sample: '<1 of 2>',
      tiles: [{ label: '<tile>' }, { label: 'hero', highlight: true }],
      caption: 'the **moment** <here>',
      stat: '<stat>',
    },
  };

  it('never emits raw event text as markup', () => {
    for (const t of RECAP_TEMPLATES) {
      const html = t.render(hostile);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).not.toContain('<svg/onload=alert(1)>');
    }
  });

  it('keeps **bold** emphasis working on escaped descriptors', () => {
    const html = renderRecapVideo('by-the-numbers', hostile);
    expect(html).toContain('a <strong>bold</strong> &lt;claim&gt;');
  });

  it('quote text cannot terminate the inline script block', () => {
    const html = renderQuoteCascade(hostile);
    // The only </script> closers are the document's own two tags
    // (gsap loader + timeline block); quote-supplied ones are <-escaped.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain('\\u003c/script');
  });

  it('escapes chars and words at runtime before the innerHTML write', () => {
    const html = renderQuoteCascade(hostile);
    expect(html).toContain("esc(c)");
    expect(html).toContain("esc(w)");
  });

  it('normalises a punctuated accent word to match the runtime word check', () => {
    const html = renderQuoteCascade({
      event: aie2026.event,
      quotes: [
        {
          text: 'this is the testbed, full stop.',
          technique: 'word-slam',
          accentWord: 'testbed!',
          who: 'w',
          ctx: 'c',
        },
      ],
    });
    expect(html).toContain('const accent = "testbed";');
  });
});

describe('determinism', () => {
  it('identical input produces byte-identical output', () => {
    for (const t of RECAP_TEMPLATES) {
      for (const format of FORMATS) {
        expect(t.render(aie2026, { format })).toBe(t.render(aie2026, { format }));
        expect(t.render(devsummit2026, { format })).toBe(
          t.render(devsummit2026, { format }),
        );
      }
    }
  });
});
