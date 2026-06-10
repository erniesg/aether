/**
 * Registry + variant-plan behaviour for the event-recap video templates.
 */
import { describe, expect, it } from 'vitest';
import {
  RECAP_FORMATS,
  RECAP_TEMPLATES,
  getRecapTemplate,
  planRecapVariants,
  renderAvailableRecapVideos,
  renderRecapVideo,
  type RecapTemplateId,
  type RecapVideoData,
} from './index';
import aie2026 from './fixtures/aie-2026.recap';

const ALL_IDS: RecapTemplateId[] = [
  'atlas-reveal',
  'by-the-numbers',
  'quote-cascade',
  'photo-mosaic',
];

describe('template registry', () => {
  it('ships the four variants in canonical order', () => {
    expect(RECAP_TEMPLATES.map((t) => t.id)).toEqual(ALL_IDS);
  });

  it('looks up each template by id', () => {
    for (const id of ALL_IDS) {
      expect(getRecapTemplate(id).id).toBe(id);
    }
  });

  it('throws on an unknown id', () => {
    expect(() => getRecapTemplate('vhs-glitch' as RecapTemplateId)).toThrow(
      /Unknown recap template/,
    );
  });

  it('every template declares a positive duration', () => {
    for (const t of RECAP_TEMPLATES) {
      expect(t.durationSeconds).toBeGreaterThan(0);
    }
  });
});

describe('renderAvailableRecapVideos', () => {
  it('renders all four variants when the payload is complete', () => {
    const rendered = renderAvailableRecapVideos(aie2026);
    expect(rendered.map((r) => r.id)).toEqual(ALL_IDS);
    for (const r of rendered) {
      expect(r.html).toContain('<!doctype html>');
    }
  });

  it('skips variants whose data is absent instead of throwing', () => {
    const partial: RecapVideoData = {
      event: aie2026.event,
      atlas: aie2026.atlas,
      funnel: aie2026.funnel,
    };
    const rendered = renderAvailableRecapVideos(partial);
    expect(rendered.map((r) => r.id)).toEqual(['atlas-reveal', 'by-the-numbers']);
  });

  it('treats empty arrays as absent', () => {
    const partial: RecapVideoData = { ...aie2026, quotes: [] };
    expect(renderAvailableRecapVideos(partial).map((r) => r.id)).not.toContain(
      'quote-cascade',
    );
  });

  it('threads the format option through to every render', () => {
    for (const r of renderAvailableRecapVideos(aie2026, { format: 'square' })) {
      expect(r.html).toContain('data-width="1080"');
      expect(r.html).toContain('data-height="1080"');
    }
  });
});

describe('planRecapVariants', () => {
  it('defaults to the vertical reference format', () => {
    const plan = planRecapVariants(aie2026);
    expect(plan).toHaveLength(4);
    expect(plan.every((e) => e.format === 'vertical')).toBe(true);
    expect(plan.every((e) => e.status === 'renderable')).toBe(true);
  });

  it('fans out template-major over the supplied formats', () => {
    const plan = planRecapVariants(aie2026, ['vertical', 'square', 'landscape']);
    expect(plan).toHaveLength(12);
    expect(plan.slice(0, 3).map((e) => `${e.templateId}/${e.format}`)).toEqual([
      'atlas-reveal/vertical',
      'atlas-reveal/square',
      'atlas-reveal/landscape',
    ]);
    for (const entry of plan) {
      expect({ width: entry.width, height: entry.height }).toEqual({
        width: RECAP_FORMATS[entry.format].width,
        height: RECAP_FORMATS[entry.format].height,
      });
    }
  });

  it('marks templates with missing data as skipped, with the reason', () => {
    const partial: RecapVideoData = { event: aie2026.event, atlas: aie2026.atlas };
    const plan = planRecapVariants(partial, ['vertical']);
    const byId = Object.fromEntries(plan.map((e) => [e.templateId, e]));
    expect(byId['atlas-reveal'].status).toBe('renderable');
    expect(byId['quote-cascade']).toMatchObject({
      status: 'skipped',
      reason: 'no quotes data',
    });
    expect(byId['photo-mosaic']).toMatchObject({
      status: 'skipped',
      reason: 'no mosaic data',
    });
  });

  it('deduplicates repeated formats', () => {
    const plan = planRecapVariants(aie2026, ['square', 'square', 'vertical']);
    expect(plan).toHaveLength(8);
    expect(plan.slice(0, 2).map((e) => e.format)).toEqual(['square', 'vertical']);
  });

  it('is deterministic for the same inputs', () => {
    const a = planRecapVariants(aie2026, ['vertical', 'landscape']);
    const b = planRecapVariants(aie2026, ['vertical', 'landscape']);
    expect(a).toEqual(b);
  });

  it('every renderable plan entry actually renders at its planned size', () => {
    const plan = planRecapVariants(aie2026, ['vertical', 'square', 'landscape']);
    for (const entry of plan.filter((e) => e.status === 'renderable')) {
      const html = renderRecapVideo(entry.templateId, aie2026, { format: entry.format });
      expect(html).toContain(`data-width="${entry.width}"`);
      expect(html).toContain(`data-height="${entry.height}"`);
      expect(html).toContain(`data-duration="${entry.durationSeconds}"`);
    }
  });
});
