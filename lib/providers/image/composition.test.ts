import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyComposition } from './composition';
import type {
  ImageComposition,
  ImageConstraintToken,
  ImageCompositionTextStrategy,
  ImageProviderId,
} from './types';

const ADAPTERS: ImageProviderId[] = ['openai', 'gemini', 'replicate', 'volcengine'];
const STRATEGIES: ImageCompositionTextStrategy[] = ['none', 'baked', 'auto'];
const TOKENS: ImageConstraintToken[] = [
  'no-faces',
  'no-watermarks',
  'no-signatures',
  'no-unknown-brand-logos',
  'no-typography-artifacts',
  'no-nsfw-overlay-text',
];

describe('applyComposition · matrix', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // 4 adapters × 3 text-strategies × 6 constraint tokens = 72 combinations.
  for (const adapter of ADAPTERS) {
    for (const textStrategy of STRATEGIES) {
      for (const token of TOKENS) {
        it(`${adapter} × ${textStrategy} × ${token} produces an adapter-native payload`, () => {
          const composition: ImageComposition = { textStrategy, constraints: [token] };
          const out = applyComposition(
            { prompt: 'sunset', negativePrompt: 'blur' },
            composition,
            adapter
          );

          // Every combination returns a usable prompt, never undefined/empty.
          expect(out.prompt.length).toBeGreaterThan(0);

          // `baked` and `auto` never inject text-suppression phrasing — that
          // is the contract that lets opt-in typography flows work.
          if (textStrategy !== 'none') {
            expect(out.prompt.toLowerCase()).not.toContain('no text');
            expect(out.prompt.toLowerCase()).not.toContain('no typography');
          }

          // Existing base negative prompt is preserved (adapters that route
          // negatives through extraParams still echo it on the return shape).
          if (adapter !== 'openai') {
            expect(out.negativePrompt).toContain('blur');
          } else {
            expect(out.negativePrompt).toBe('blur');
          }
        });
      }
    }
  }

  it('openai: textStrategy=none appends a natural-language clause to prompt', () => {
    const out = applyComposition({ prompt: 'sunset' }, { textStrategy: 'none' }, 'openai');
    expect(out.prompt).toContain('sunset');
    expect(out.prompt.toLowerCase()).toContain('no text');
    expect(out.prompt.toLowerCase()).toContain('no typography');
    expect(out.prompt.toLowerCase()).toContain('no lettering');
    expect(out.prompt.toLowerCase()).toContain('pure imagery only');
    expect(out.negativePrompt).toBeUndefined();
  });

  it('openai: constraint tokens append to the prompt clause', () => {
    const out = applyComposition(
      { prompt: 'sunset' },
      { textStrategy: 'auto', constraints: ['no-signatures', 'no-watermarks'] },
      'openai'
    );
    expect(out.prompt.toLowerCase()).toContain('no signatures');
    expect(out.prompt.toLowerCase()).toContain('no watermarks');
  });

  it('gemini: textStrategy=none seeds both promptPrefix and negative tokens', () => {
    const out = applyComposition({ prompt: 'sunset' }, { textStrategy: 'none' }, 'gemini');
    expect(out.prompt.startsWith('No text, no typography.')).toBe(true);
    expect(out.negativePrompt).toBeDefined();
    expect(out.negativePrompt!.toLowerCase()).toContain('text');
    expect(out.negativePrompt!.toLowerCase()).toContain('typography');
  });

  it('replicate: passes through adapter native negative_prompt list', () => {
    const out = applyComposition(
      { prompt: 'sunset' },
      { textStrategy: 'none', constraints: ['no-signatures'] },
      'replicate'
    );
    expect(out.prompt).toBe('sunset');
    expect(out.negativePrompt).toBeDefined();
    expect(out.negativePrompt!.toLowerCase()).toContain('text');
    expect(out.negativePrompt!.toLowerCase()).toContain('signature');
  });

  it('volcengine: emits a native negative_prompt field through extraParams', () => {
    const out = applyComposition(
      { prompt: 'sunset' },
      { textStrategy: 'none' },
      'volcengine'
    );
    expect(out.prompt).toBe('sunset');
    expect(out.extraParams?.negative_prompt).toBeDefined();
    expect(String(out.extraParams!.negative_prompt).toLowerCase()).toContain('text');
  });

  it('all adapters are no-ops when composition is empty', () => {
    for (const adapter of ADAPTERS) {
      const out = applyComposition(
        { prompt: 'sunset', negativePrompt: 'blur' },
        {},
        adapter
      );
      expect(out.prompt).toBe('sunset');
      expect(out.negativePrompt).toBe('blur');
      expect(out.extraParams).toBeUndefined();
    }
  });

  it('unknown tokens warn but never throw (forward-compat)', () => {
    for (const adapter of ADAPTERS) {
      const fake = 'no-invented-token' as ImageConstraintToken;
      expect(() =>
        applyComposition({ prompt: 'sunset' }, { constraints: [fake] }, adapter)
      ).not.toThrow();
    }
    expect(warnSpy).toHaveBeenCalled();
  });

  it('no-signatures smoke: every adapter emits a signature-suppressing token', () => {
    const composition: ImageComposition = {
      textStrategy: 'auto',
      constraints: ['no-signatures'],
    };
    const openai = applyComposition({ prompt: 'x' }, composition, 'openai');
    expect(openai.prompt.toLowerCase()).toContain('signature');

    const gemini = applyComposition({ prompt: 'x' }, composition, 'gemini');
    expect(gemini.negativePrompt!.toLowerCase()).toContain('signature');

    const replicate = applyComposition({ prompt: 'x' }, composition, 'replicate');
    expect(replicate.negativePrompt!.toLowerCase()).toContain('signature');

    const volc = applyComposition({ prompt: 'x' }, composition, 'volcengine');
    expect(String(volc.extraParams!.negative_prompt).toLowerCase()).toContain('signature');
  });
});
