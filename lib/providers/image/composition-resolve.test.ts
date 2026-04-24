import { describe, it, expect } from 'vitest';
import { resolveComposition, SYSTEM_DEFAULT_COMPOSITION } from './composition';

describe('resolveComposition · merge precedence', () => {
  it('returns the system default when neither per-call nor workspace is set', () => {
    expect(resolveComposition(undefined, undefined)).toEqual(SYSTEM_DEFAULT_COMPOSITION);
  });

  it('workspace default overrides system default', () => {
    const out = resolveComposition(undefined, {
      textStrategy: 'baked',
      constraints: ['no-watermarks'],
    });
    expect(out.textStrategy).toBe('baked');
    expect(out.constraints).toEqual(['no-watermarks']);
  });

  it('per-call overrides workspace default', () => {
    const out = resolveComposition(
      { textStrategy: 'none' },
      { textStrategy: 'baked', constraints: ['no-watermarks'] }
    );
    expect(out.textStrategy).toBe('none');
    // per-call did not set constraints, so workspace wins on that field.
    expect(out.constraints).toEqual(['no-watermarks']);
  });

  it("per-call textStrategy='auto' passes through, overriding defaults", () => {
    const out = resolveComposition(
      { textStrategy: 'auto' },
      { textStrategy: 'none', constraints: ['no-signatures'] }
    );
    expect(out.textStrategy).toBe('auto');
    expect(out.constraints).toEqual(['no-signatures']);
  });

  it('per-call constraints: [] explicitly clears inherited tokens', () => {
    const out = resolveComposition(
      { constraints: [] },
      { textStrategy: 'none', constraints: ['no-signatures', 'no-watermarks'] }
    );
    expect(out.textStrategy).toBe('none');
    expect(out.constraints).toEqual([]);
  });

  it('per-call constraints fully replaces inherited ones (not merged/unioned)', () => {
    const out = resolveComposition(
      { constraints: ['no-faces'] },
      { constraints: ['no-signatures', 'no-watermarks'] }
    );
    expect(out.constraints).toEqual(['no-faces']);
  });

  it('does not mutate the caller-provided composition objects', () => {
    const workspace = { textStrategy: 'none' as const, constraints: ['no-signatures' as const] };
    const perCall = { constraints: ['no-faces' as const] };
    const frozen = JSON.stringify({ workspace, perCall });
    resolveComposition(perCall, workspace);
    expect(JSON.stringify({ workspace, perCall })).toBe(frozen);
  });

  it('system default is the text-overlay-safe baseline', () => {
    expect(SYSTEM_DEFAULT_COMPOSITION.textStrategy).toBe('none');
    expect(SYSTEM_DEFAULT_COMPOSITION.constraints).toContain('no-signatures');
    expect(SYSTEM_DEFAULT_COMPOSITION.constraints).toContain('no-watermarks');
  });
});
