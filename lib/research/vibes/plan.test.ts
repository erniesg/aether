import { describe, expect, it } from 'vitest';
import { buildVibesPlan, extractBriefTerms } from './plan';

describe('vibes research planning', () => {
  it('turns a natural-language event brief into reviewed social seeds', () => {
    const plan = buildVibesPlan({
      brief:
        'Track AI Engineer Summit Singapore across X and LinkedIn. Add @aiDotEngineer, #AIE2026, workshops, side events, sponsor booths.',
      platforms: ['x', 'linkedin'],
    });

    expect(plan.subject).toBe('AI Engineer Summit Singapore');
    expect(plan.subjectKind).toBe('event');
    expect(plan.platforms).toEqual(['x', 'linkedin']);
    expect(plan.accounts).toContain('@aiDotEngineer');
    expect(plan.hashtags).toContain('#AIE2026');
    expect(plan.querySet).toEqual(
      expect.arrayContaining(['@aiDotEngineer "AI Engineer Summit Singapore"', '#AIE2026 "AI Engineer Summit Singapore"'])
    );
    expect(plan.auditSteps.map((step) => step.id)).toEqual([
      'brief.frontier',
      'frontier.review',
      'corpus.collect',
      'corpus.synthesize',
      'report.publish',
    ]);
  });

  it('deduplicates keywords derived from hashtag/account bare tokens', () => {
    const plan = buildVibesPlan({
      brief:
        'Track AI Engineer Summit Singapore across X and LinkedIn. Add @aiDotEngineer, #AIE2026, workshops, side events, sponsor booths.',
      platforms: ['x', 'linkedin'],
    });

    // hashtags/accounts chips must remain intact
    expect(plan.hashtags).toContain('#AIE2026');
    expect(plan.accounts).toContain('@aiDotEngineer');

    // the bare token must NOT appear as a keyword chip
    const lowerKeywords = plan.keywords.map((k) => k.toLowerCase());
    expect(lowerKeywords).not.toContain('aie2026');
    expect(lowerKeywords).not.toContain('aidotEngineer'.toLowerCase());

    // querySet entries built from hashtags/accounts must still exist
    expect(plan.querySet).toEqual(
      expect.arrayContaining([
        '#AIE2026 "AI Engineer Summit Singapore"',
        '@aiDotEngineer "AI Engineer Summit Singapore"',
      ])
    );
  });

  it('keeps product and brand briefs provider-neutral and generic', () => {
    const plan = buildVibesPlan({
      brief:
        'Social listening for Nothing Phone launch. Include camera samples, creator reactions, @nothing, #NothingPhone, https://nothing.tech/',
    });

    expect(plan.subject).toBe('Nothing Phone launch');
    expect(plan.subjectKind).toBe('event');
    expect(plan.sourceLinks).toContain('https://nothing.tech/');
    expect(plan.querySet.join('\n')).not.toMatch(/AI engineer/i);
    expect(plan.managedRuntimes.map((runtime) => runtime.provider)).toEqual([
      'anthropic',
      'openai',
      'aether',
    ]);
  });

  it('extracts accounts, hashtags, urls, and keywords before an LLM is needed', () => {
    const terms = extractBriefTerms(
      'Listen for @brandhq and #LaunchDay around "creator kit" via https://example.com/event.'
    );

    expect(terms.accounts).toEqual(['@brandhq']);
    expect(terms.hashtags).toEqual(['#LaunchDay']);
    expect(terms.sourceLinks).toEqual(['https://example.com/event']);
    expect(terms.keywords).toContain('creator kit');
  });
});
