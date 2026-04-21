import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins multiple class tokens', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b');
  });

  it('resolves tailwind conflicts, keeping the last winner', () => {
    // bg-red-500 then bg-blue-500 → twMerge keeps the later declaration.
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('supports arrays and object class maps', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });

  it('ignores duplicate non-conflicting classes', () => {
    // clsx/twMerge keeps stable ordering but non-conflicting repeats remain.
    const out = cn('flex', 'items-center', 'flex');
    expect(out.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center']));
  });
});
