import { describe, expect, it } from 'vitest';
import { normalizeHttpUrlInput, parseHttpUrlInput } from './normalize';

describe('URL input normalization', () => {
  it('adds https to bare creator-facing domains', () => {
    expect(normalizeHttpUrlInput('tong.berlayar.ai')).toBe(
      'https://tong.berlayar.ai'
    );
    expect(normalizeHttpUrlInput('www.example.com/path?x=1')).toBe(
      'https://www.example.com/path?x=1'
    );
  });

  it('preserves explicit schemes before validation', () => {
    expect(normalizeHttpUrlInput('https://example.com')).toBe(
      'https://example.com'
    );
    expect(normalizeHttpUrlInput('ftp://example.com')).toBe('ftp://example.com');
  });

  it('parses only http and https URLs', () => {
    expect(parseHttpUrlInput('tong.berlayar.ai').href).toBe(
      'https://tong.berlayar.ai/'
    );
    expect(() => parseHttpUrlInput('ftp://example.com')).toThrow(
      /unsupported URL scheme/
    );
  });
});
