import { describe, expect, it, vi } from 'vitest';
import { extractResumeFacts, extractSiteFacts } from './evidence-facts';

const RESUME_MARKDOWN = [
  '# Ernie SG',
  '- Built a Next.js 15 + Cloudflare Workers canvas tool for creator workflows.',
  '- Led a Convex graph migration covering 18 workspace entities.',
  '- Shipped provider adapters for OpenAI, Gemini, Replicate, and Volcengine.',
  '- Ran 6 production AI-engineering demos for founders and design partners.',
].join('\n');

const SITE_MARKDOWN = [
  '# Ernie SG',
  'Independent AI engineer building canvas-native creative systems.',
  'Projects include aether, a Next.js and tldraw workspace for multiformat generation.',
  'The site lists Cloudflare Workers deployment notes and Convex persistence writeups.',
].join('\n');

describe('evidence facts · resume and site extraction', () => {
  it('extracts at least three resume claims with resume source attribution and no raw-text logging', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const facts = extractResumeFacts({
      text: RESUME_MARKDOWN,
      ref: 'resume.md',
    });

    expect(facts.claims.length).toBeGreaterThanOrEqual(3);
    expect(facts.claims.every((claim) => claim.source.kind === 'resume')).toBe(true);
    expect(facts.claims.every((claim) => claim.source.ref === 'resume.md')).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('extracts at least two site claims with site source attribution', () => {
    const facts = extractSiteFacts({
      markdown: SITE_MARKDOWN,
      url: 'https://ernie.sg',
    });

    expect(facts.claims.length).toBeGreaterThanOrEqual(2);
    expect(facts.claims.every((claim) => claim.source)).toEqual(true);
    expect(facts.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: { kind: 'site', ref: 'https://ernie.sg' },
        }),
      ])
    );
  });
});
