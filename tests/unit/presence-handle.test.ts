import { describe, expect, it } from 'vitest';
import { normalizeXHandle } from '@/lib/presence/handle';

describe('normalizeXHandle', () => {
  it.each([
    ['erniesg', '@erniesg'],
    ['@erniesg', '@erniesg'],
    ['https://x.com/erniesg/status/123', '@erniesg'],
    ['https://twitter.com/ernie_sg', '@ernie_sg'],
    [' x.com/ErnieSG ', '@ErnieSG'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeXHandle(input)).toBe(expected);
  });

  it.each(['', '@', 'https://x.com/', 'not a handle with spaces'])(
    'returns an empty string for invalid input %s',
    (input) => {
      expect(normalizeXHandle(input)).toBe('');
    }
  );
});
