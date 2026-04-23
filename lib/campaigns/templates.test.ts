import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_TEMPLATES,
  getCampaignTemplate,
  listCampaignTemplates,
} from './templates';
import type { CampaignTemplateId } from './types';

const EXPECTED_IDS: ReadonlyArray<CampaignTemplateId> = [
  'launch',
  'drop',
  'evergreen',
  'announcement',
  'teaser',
  'recap',
];

const VALID_FORMATS = new Set([
  'ig-post',
  'story',
  'reel-cover',
  'linkedin-landscape',
]);

describe('campaign templates', () => {
  it('exports exactly 6 seeded templates', () => {
    expect(CAMPAIGN_TEMPLATES).toHaveLength(6);
    expect(listCampaignTemplates()).toBe(CAMPAIGN_TEMPLATES);
  });

  it('covers the expected ids exactly once', () => {
    const seen = new Set(CAMPAIGN_TEMPLATES.map((t) => t.id));
    for (const id of EXPECTED_IDS) expect(seen.has(id)).toBe(true);
    expect(seen.size).toBe(EXPECTED_IDS.length);
  });

  it.each(EXPECTED_IDS)('template %s has a complete, typed shape', (id) => {
    const t = getCampaignTemplate(id);
    expect(t.id).toBe(id);
    expect(typeof t.label).toBe('string');
    expect(t.label.trim().length).toBeGreaterThan(0);
    // Restraint rule: card label fits 1-3 words
    expect(t.label.trim().split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(typeof t.iconName).toBe('string');
    expect(t.iconName.length).toBeGreaterThan(0);
    expect(typeof t.purpose).toBe('string');
    expect(t.purpose.length).toBeGreaterThan(0);
    expect(Array.isArray(t.defaultFormats)).toBe(true);
    expect(t.defaultFormats.length).toBeGreaterThan(0);
    for (const fmt of t.defaultFormats) {
      expect(VALID_FORMATS.has(fmt)).toBe(true);
    }
    expect(Array.isArray(t.suggestedTone)).toBe(true);
    expect(t.suggestedTone.length).toBeGreaterThan(0);
    expect(typeof t.starterBrief).toBe('string');
    expect(t.starterBrief.trim().length).toBeGreaterThan(0);
  });

  it('throws on unknown ids', () => {
    // @ts-expect-error narrow: intentionally invalid id
    expect(() => getCampaignTemplate('nope')).toThrow(/unknown campaign template/);
  });
});
