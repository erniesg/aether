import { describe, expect, it } from 'vitest';
import type { MotionBrief } from './brief';
import { compileQuoteCascade } from './compile';

const BRIEF: MotionBrief = {
  id: 'evt-1-quotes',
  title: 'heard on the floor',
  footerLeft: '↳ heard on the floor',
  footerRight: 'aie 2026',
  quotes: [
    { text: 'The harness is the product.', who: '@ada', ctx: 'x · agents in production' },
    { text: 'Evals are the new tests.', who: '@grace', ctx: 'x · evals everywhere' },
    {
      text: 'Singapore can be the testbed for agents.',
      who: 'vivian',
      ctx: 'keynote',
      accentWord: 'testbed',
    },
  ],
};

describe('compileQuoteCascade', () => {
  it('emits one scene per quote with escaped content and correct duration', () => {
    const { html, durationSeconds } = compileQuoteCascade(BRIEF);

    expect(durationSeconds).toBe(18);
    expect(html).toContain('data-duration="18"');
    expect((html.match(/class="scene"/g) ?? []).length).toBe(3);
    expect(html).toContain('The harness is the product.');
    expect(html).toContain('@grace');
    expect(html).toContain('aie 2026');
  });

  it('escapes HTML in quote content', () => {
    const { html } = compileQuoteCascade({
      ...BRIEF,
      quotes: [{ text: '<script>alert(1)</script>', who: 'x', ctx: 'y' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('scales duration with quote count', () => {
    const { durationSeconds, html } = compileQuoteCascade({
      ...BRIEF,
      quotes: BRIEF.quotes.slice(0, 1),
    });
    expect(durationSeconds).toBe(6);
    expect((html.match(/class="scene"/g) ?? []).length).toBe(1);
  });

  it('injects the accent word into the slam scene data', () => {
    const { html } = compileQuoteCascade(BRIEF);
    expect(html).toContain('"accentWord":"testbed"');
  });

  it('applies brand palette overrides', () => {
    const { html } = compileQuoteCascade({
      ...BRIEF,
      palette: { paper: '#101014', ink: '#f2f2f2', graphite: '#9a9a9a', accent: '#3ad17c' },
    });
    expect(html).toContain('#101014');
    expect(html).toContain('#3ad17c');
  });
});
