import { describe, expect, it } from 'vitest';
import { MAX_REF_BYTES, formatRefSizeError } from '@/lib/refs/limits';

describe('refs limits', () => {
  it('MAX_REF_BYTES is 20 MB', () => {
    expect(MAX_REF_BYTES).toBe(20 * 1024 * 1024);
  });

  it('formatRefSizeError includes file name, actual MB, and limit', () => {
    const msg = formatRefSizeError({ name: 'hero.png', size: 12_400_000 });
    // actual size rounds to 1 decimal
    expect(msg).toContain('hero.png');
    expect(msg).toContain('11.8MB');
    expect(msg).toContain('20MB');
  });

  it('rounds to exactly 1 decimal place', () => {
    // 15.5 MB exactly
    const msg = formatRefSizeError({ name: 'bg.jpg', size: 15.5 * 1024 * 1024 });
    expect(msg).toContain('15.5MB');
  });

  it('works with large files well over the limit', () => {
    const msg = formatRefSizeError({ name: 'video.mp4', size: 100 * 1024 * 1024 });
    expect(msg).toContain('video.mp4');
    expect(msg).toContain('100.0MB');
  });
});
