import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createR2Storage } from './r2';
import { StorageUnavailableError } from './types';

describe('R2 public-storage adapter', () => {
  beforeEach(() => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
    delete process.env.R2_PUBLIC_BASE_URL;
  });

  it('isAvailable=false when env vars are missing', () => {
    const r2 = createR2Storage();
    expect(r2.isAvailable()).toBe(false);
  });

  it('throws StorageUnavailableError on stage when env is missing', async () => {
    const r2 = createR2Storage();
    await expect(
      r2.stage({ bytes: Buffer.from('hi'), mimeType: 'image/png' })
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('signs and PUTs to the R2 endpoint with public-friendly cache headers', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    let capturedBody: ArrayBuffer | Uint8Array | undefined;

    const fakeFetch: typeof fetch = vi.fn(async (input, init) => {
      capturedUrl = typeof input === 'string' ? input : (input as URL).toString();
      capturedMethod = init?.method;
      const hdrs: Record<string, string> = {};
      const h = init?.headers;
      if (h instanceof Headers) {
        h.forEach((v, k) => (hdrs[k.toLowerCase()] = v));
      } else if (h && typeof h === 'object') {
        for (const [k, v] of Object.entries(h)) {
          hdrs[k.toLowerCase()] = String(v);
        }
      }
      capturedHeaders = hdrs;
      capturedBody = init?.body as ArrayBuffer | Uint8Array | undefined;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const r2 = createR2Storage({
      fetch: fakeFetch,
      config: {
        accountId: 'acct-123',
        accessKeyId: 'AKID',
        secretAccessKey: 'SECRET',
        bucket: 'aether-public',
        publicBaseUrl: 'https://pub-test.r2.dev',
      },
    });
    expect(r2.isAvailable()).toBe(true);

    const bytes = Buffer.from('hello-r2');
    const result = await r2.stage({
      bytes,
      mimeType: 'image/png',
      key: 'fixtures/hero.png',
    });

    // PUT to S3-compatible R2 endpoint, path-style.
    expect(capturedMethod).toBe('PUT');
    expect(capturedUrl).toContain('acct-123.r2.cloudflarestorage.com');
    expect(capturedUrl).toContain('/aether-public/');
    expect(capturedUrl).toContain('fixtures');

    // Cache-control friendly to Meta / LinkedIn / X pullers.
    expect(capturedHeaders?.['cache-control']).toContain('public');
    // Mime type round-trips.
    expect(capturedHeaders?.['content-type']).toBe('image/png');
    // SigV4 signing happened (Authorization header present).
    expect(capturedHeaders?.authorization).toMatch(/^AWS4-HMAC-SHA256 /);

    // Public URL is the configured base + key.
    expect(result.publicUrl).toBe('https://pub-test.r2.dev/fixtures/hero.png');
    expect(result.key).toBe('fixtures/hero.png');
    expect(result.size).toBe(bytes.byteLength);
    expect(result.provider).toBe('r2');
  });

  it('auto-generates a date-prefixed key when none is provided', async () => {
    const fakeFetch: typeof fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const r2 = createR2Storage({
      fetch: fakeFetch,
      config: {
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'd',
        publicBaseUrl: 'https://pub.example',
      },
    });
    const result = await r2.stage({
      bytes: Buffer.from('x'),
      mimeType: 'image/png',
    });
    // yyyy-mm-dd inside the key.
    expect(result.key).toMatch(/^aether-staged\/\d{4}-\d{2}-\d{2}\//);
    expect(result.key).toMatch(/\.png$/);
  });

  it('raises on non-2xx PUT response', async () => {
    const fakeFetch: typeof fetch = vi.fn(
      async () => new Response('AccessDenied', { status: 403 })
    ) as unknown as typeof fetch;
    const r2 = createR2Storage({
      fetch: fakeFetch,
      config: {
        accountId: 'a',
        accessKeyId: 'b',
        secretAccessKey: 'c',
        bucket: 'd',
        publicBaseUrl: 'https://pub.example',
      },
    });
    await expect(
      r2.stage({ bytes: Buffer.from('x'), mimeType: 'image/png' })
    ).rejects.toThrow(/HTTP 403/);
  });
});
