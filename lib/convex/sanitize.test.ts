import { describe, expect, it } from 'vitest';
import {
  CONVEX_IMAGE_URL_LIMIT_BYTES,
  sanitizeImageUrlForConvex,
} from './sanitize';

describe('sanitizeImageUrlForConvex', () => {
  it('returns undefined for null/undefined/empty', () => {
    expect(sanitizeImageUrlForConvex(undefined)).toBeUndefined();
    expect(sanitizeImageUrlForConvex(null)).toBeUndefined();
    expect(sanitizeImageUrlForConvex('')).toBeUndefined();
  });

  it('drops data URLs regardless of size', () => {
    expect(sanitizeImageUrlForConvex('data:image/png;base64,aGVsbG8=')).toBeUndefined();
    expect(
      sanitizeImageUrlForConvex(`data:image/png;base64,${'A'.repeat(10)}`)
    ).toBeUndefined();
  });

  it('preserves regular https URLs', () => {
    const url = 'https://r2.aether.berlayar.ai/runs/abc123/0.png';
    expect(sanitizeImageUrlForConvex(url)).toBe(url);
  });

  it('drops outsized non-data strings as a defensive ceiling', () => {
    const huge = 'https://example.com/' + 'A'.repeat(CONVEX_IMAGE_URL_LIMIT_BYTES);
    expect(sanitizeImageUrlForConvex(huge)).toBeUndefined();
  });

  it('keeps URLs at exactly the limit', () => {
    const prefix = 'https://x/';
    const justAt =
      prefix + 'A'.repeat(CONVEX_IMAGE_URL_LIMIT_BYTES - prefix.length);
    expect(justAt.length).toBe(CONVEX_IMAGE_URL_LIMIT_BYTES);
    expect(sanitizeImageUrlForConvex(justAt)?.length).toBe(
      CONVEX_IMAGE_URL_LIMIT_BYTES
    );
  });
});
