import { describe, expect, it } from 'vitest';
import { buildReframePrompt, evaluateSubjectVsSafeZone } from './reframeCheck';

describe('evaluateSubjectVsSafeZone', () => {
  it('returns ok for a fully-centered subject on story', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
    });
    expect(r.status).toBe('ok');
    expect(r.violations).toEqual([]);
    expect(r.suggestedAction).toBe('none');
  });

  it('flags a subject that intrudes into the story top chrome', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.3, y: 0.0, w: 0.4, h: 0.3 },
    });
    expect(r.violations.some((v) => v.bandId === 'top')).toBe(true);
    expect(['warn', 'block']).toContain(r.status);
    expect(['shift', 'inpaint']).toContain(r.suggestedAction);
  });

  it('flags a subject that sits in the story bottom CTA band', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.3, y: 0.75, w: 0.4, h: 0.2 },
    });
    expect(r.violations.some((v) => v.bandId === 'bottom')).toBe(true);
    expect(r.status).not.toBe('ok');
  });

  it('is always ok for ig-post (kind none)', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'ig-post',
      subjectBbox: { x: 0, y: 0, w: 1, h: 1 },
    });
    expect(r.status).toBe('ok');
    expect(r.violations).toEqual([]);
  });

  it('is always ok for fb-feed and x-post (kind none)', () => {
    for (const preset of ['fb-feed', 'x-post'] as const) {
      const r = evaluateSubjectVsSafeZone({
        preset,
        subjectBbox: { x: 0, y: 0, w: 1, h: 1 },
      });
      expect(r.status).toBe('ok');
    }
  });

  it('warns for a linkedin subject that hugs the lower-right', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'linkedin-landscape',
      subjectBbox: { x: 0.85, y: 0.85, w: 0.14, h: 0.14 },
    });
    expect(r.status).not.toBe('ok');
    const ids = r.violations.map((v) => v.bandId);
    expect(ids).toEqual(expect.arrayContaining(['right']));
  });

  it('reports crop violations for reel-cover when subject drifts out of the centre', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'reel-cover',
      subjectBbox: { x: 0.4, y: 0.01, w: 0.2, h: 0.1 },
    });
    expect(r.violations.some((v) => v.bandId === 'crop')).toBe(true);
    expect(['warn', 'block']).toContain(r.status);
  });

  it('blocks when intrusion exceeds the block threshold', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0, y: 0, w: 1, h: 0.25 },
    });
    expect(r.status).toBe('block');
    expect(r.suggestedAction).toBe('inpaint');
  });

  it('treats a zero-area subject as ok without throwing', () => {
    const r = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.5, y: 0.5, w: 0, h: 0 },
    });
    expect(r.status).toBe('ok');
  });

  it('intrusionFraction grows with violation area', () => {
    const small = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.4, y: 0.01, w: 0.1, h: 0.05 },
    });
    const big = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.1, y: 0.0, w: 0.8, h: 0.12 },
    });
    expect(big.intrusionFraction).toBeGreaterThan(small.intrusionFraction);
  });
});

describe('buildReframePrompt', () => {
  it('returns empty for an ok result', () => {
    const prompt = buildReframePrompt(
      {
        status: 'ok',
        intrusionFraction: 0,
        violations: [],
        suggestedAction: 'none',
      },
      'story'
    );
    expect(prompt).toBe('');
  });

  it('names the violating band and the preset label', () => {
    const result = evaluateSubjectVsSafeZone({
      preset: 'story',
      subjectBbox: { x: 0.3, y: 0.0, w: 0.4, h: 0.3 },
    });
    const prompt = buildReframePrompt(result, 'story');
    expect(prompt.toLowerCase()).toContain('top');
    expect(prompt.toLowerCase()).toContain('story');
  });

  it('uses a shift verb for warn and an extend verb for block', () => {
    const warn = buildReframePrompt(
      {
        status: 'warn',
        intrusionFraction: 0.1,
        violations: [{ bandId: 'right', overlapFraction: 0.1 }],
        suggestedAction: 'shift',
      },
      'linkedin-landscape'
    );
    const block = buildReframePrompt(
      {
        status: 'block',
        intrusionFraction: 0.3,
        violations: [{ bandId: 'top', overlapFraction: 0.3 }],
        suggestedAction: 'inpaint',
      },
      'story'
    );
    expect(warn.toLowerCase()).toMatch(/shift/);
    expect(block.toLowerCase()).toMatch(/extend/);
  });
});
