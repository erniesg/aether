import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/providers/image/util', () => ({
  fetchWithTimeout: vi.fn(),
}));

const fetchWithTimeoutMock = vi.mocked(
  (await import('@/lib/providers/image/util')).fetchWithTimeout
);

describe('GET /api/download-image', () => {
  beforeEach(() => {
    fetchWithTimeoutMock.mockReset();
    process.env.NEXT_PUBLIC_CONVEX_URL = 'https://demo.convex.cloud';
  });

  it('returns hosted canvas assets as attachments', async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    );
    const { GET } = await import('@/app/api/download-image/route');

    const response = await GET(
      new Request(
        'http://localhost/api/download-image?url=https%3A%2F%2Fdemo.convex.cloud%2Fapi%2Fstorage%2Fasset&filename=hero.png'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="hero.png"'
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it('rejects arbitrary remote hosts', async () => {
    const { GET } = await import('@/app/api/download-image/route');

    const response = await GET(
      new Request(
        'http://localhost/api/download-image?url=https%3A%2F%2Fexample.com%2Fasset.png'
      )
    );

    expect(response.status).toBe(400);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });
});
