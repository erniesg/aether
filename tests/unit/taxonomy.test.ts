import { describe, expect, it } from 'vitest';

// Placeholder taxonomy invariant. Gets replaced with the real rule engine in Phase 3.
// The goal: assert that any UI slot carries exactly one of our five categories.

type Taxonomy = 'input' | 'output' | 'tool' | 'navigation' | 'metadata';
const VALID: readonly Taxonomy[] = ['input', 'output', 'tool', 'navigation', 'metadata'] as const;

function isValidTaxonomy(value: unknown): value is Taxonomy {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

describe('UI taxonomy invariant', () => {
  it('accepts the five canonical categories', () => {
    for (const category of VALID) {
      expect(isValidTaxonomy(category)).toBe(true);
    }
  });

  it('rejects unknown categories', () => {
    expect(isValidTaxonomy('dashboard')).toBe(false);
    expect(isValidTaxonomy('inspector')).toBe(false);
    expect(isValidTaxonomy('')).toBe(false);
    expect(isValidTaxonomy(undefined)).toBe(false);
  });
});
