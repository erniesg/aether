import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadAssetToConvex, isDataUrl } from './convexAsset';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('isDataUrl', () => {
  it('true on data: URLs', () => {
    expect(isDataUrl('data:image/png;base64,iVBOR…')).toBe(true);
  });
  it('false on http URLs and undefined', () => {
    expect(isDataUrl('https://cdn/x.png')).toBe(false);
    expect(isDataUrl(undefined)).toBe(false);
    expect(isDataUrl('')).toBe(false);
  });
});

describe('uploadAssetToConvex', () => {
  const origConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  });

  afterEach(() => {
    if (origConvexUrl) process.env.NEXT_PUBLIC_CONVEX_URL = origConvexUrl;
    else delete process.env.NEXT_PUBLIC_CONVEX_URL;
    vi.restoreAllMocks();
  });

  it('runs the 3-step Convex upload dance and returns the public URL', async () => {
    const mutation = vi.fn();
    mutation.mockResolvedValueOnce('https://convex/upload-signed-1234');
    mutation.mockResolvedValueOnce({
      id: 'asset_doc_1',
      publicUrl: 'https://convex.cdn/x/abc.png',
    });
    const fakeClient = { mutation } as unknown as Parameters<
      typeof uploadAssetToConvex
    >[0]['client'];

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === 'string' ? input : (input as URL).toString(),
        init,
      });
      return new Response(JSON.stringify({ storageId: 'sid_42' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const out = await uploadAssetToConvex({
      source: PNG_DATA_URL,
      kind: 'hero',
      sourceUrl: 'auto-mode hero render',
      client: fakeClient,
      fetchImpl,
    });

    expect(out).not.toBeNull();
    expect(out!.publicUrl).toBe('https://convex.cdn/x/abc.png');
    expect(out!.storageId).toBe('sid_42');
    expect(out!.mime).toBe('image/png');
    expect(out!.bytes).toBeGreaterThan(0);

    // Step 1: generateUploadUrl mutation called with no args.
    expect(mutation).toHaveBeenCalledTimes(2);

    // Step 2: POST to the signed URL with the decoded bytes + mime header.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://convex/upload-signed-1234');
    expect(calls[0].init?.method).toBe('POST');
    const ctype = (calls[0].init?.headers as Record<string, string>)[
      'Content-Type'
    ];
    expect(ctype).toBe('image/png');
    expect((calls[0].init?.body as Buffer).length).toBeGreaterThan(0);

    // Step 3: recordUploadedAsset got the storageId + kind + mime.
    const recordArgs = mutation.mock.calls[1][1];
    expect(recordArgs).toMatchObject({
      storageId: 'sid_42',
      kind: 'hero',
      mime: 'image/png',
      sourceUrl: 'auto-mode hero render',
    });
  });

  it('returns null when NEXT_PUBLIC_CONVEX_URL is not set (caller falls back)', async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    const out = await uploadAssetToConvex({
      source: PNG_DATA_URL,
      kind: 'hero',
    });
    expect(out).toBeNull();
  });

  it('returns null when generateUploadUrl mutation throws', async () => {
    const mutation = vi.fn().mockRejectedValueOnce(new Error('convex offline'));
    const fakeClient = { mutation } as unknown as Parameters<
      typeof uploadAssetToConvex
    >[0]['client'];
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const out = await uploadAssetToConvex({
      source: PNG_DATA_URL,
      kind: 'hero',
      client: fakeClient,
      fetchImpl,
    });
    expect(out).toBeNull();
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls)
      .toHaveLength(0);
  });

  it('returns null when the upload POST returns non-2xx', async () => {
    const mutation = vi.fn();
    mutation.mockResolvedValueOnce('https://convex/upload');
    const fakeClient = { mutation } as unknown as Parameters<
      typeof uploadAssetToConvex
    >[0]['client'];
    const fetchImpl = (async () =>
      new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    const out = await uploadAssetToConvex({
      source: PNG_DATA_URL,
      kind: 'hero',
      client: fakeClient,
      fetchImpl,
    });
    expect(out).toBeNull();
  });

  it('accepts a Buffer source and uses the explicit mime', async () => {
    const mutation = vi.fn();
    mutation.mockResolvedValueOnce('https://convex/upload');
    mutation.mockResolvedValueOnce({
      id: 'asset_2',
      publicUrl: 'https://convex.cdn/y.jpg',
    });
    const fakeClient = { mutation } as unknown as Parameters<
      typeof uploadAssetToConvex
    >[0]['client'];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ storageId: 'sid_buf' }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const buffer = Buffer.from('hello world bytes');
    const out = await uploadAssetToConvex({
      source: buffer,
      kind: 'product',
      mime: 'image/jpeg',
      client: fakeClient,
      fetchImpl,
    });
    expect(out!.mime).toBe('image/jpeg');
    expect(out!.bytes).toBe(buffer.byteLength);
    const recordArgs = mutation.mock.calls[1][1];
    expect(recordArgs.mime).toBe('image/jpeg');
    expect(recordArgs.kind).toBe('product');
  });

  it('rejects a string source that is not a data: URL', async () => {
    await expect(
      uploadAssetToConvex({ source: 'https://cdn/x.png', kind: 'hero' })
    ).rejects.toThrow(/string source must be a data: URL/);
  });
});
