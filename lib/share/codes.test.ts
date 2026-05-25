import { describe, expect, it } from 'vitest';
import { generateShareCode, isValidShareCode, normalizeShareCode } from './codes';

describe('share code generation', () => {
  it('generates lowercase pronounceable 4-letter codes by default', () => {
    for (let index = 0; index < 100; index += 1) {
      const code = generateShareCode();
      expect(code).toMatch(/^[bcdfghjkmnprstvwyz][aeiou][bcdfghjkmnprstvwyz][aeiou]$/);
      expect(isValidShareCode(code)).toBe(true);
    }
  });

  it('supports 6-letter pronounceable fallback codes', () => {
    const code = generateShareCode('pronounceable-6');
    expect(code).toMatch(/^[bcdfghjkmnprstvwyz][aeiou][bcdfghjkmnprstvwyz][aeiou][bcdfghjkmnprstvwyz][aeiou]$/);
  });

  it('normalizes pasted codes', () => {
    expect(normalizeShareCode(' Mavo ')).toBe('mavo');
    expect(isValidShareCode('mavo')).toBe(true);
    expect(isValidShareCode('../no')).toBe(false);
  });
});
