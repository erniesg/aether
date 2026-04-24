import { describe, expect, it, vi } from 'vitest';
import {
  ingestReferenceUrl,
  listReferenceProviders,
  resolveReferenceProvider,
} from './registry';

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

describe('reference registry · routing', () => {
  it('exposes all adapters including the generic fallback', () => {
    const ids = listReferenceProviders().map((p) => p.id);
    expect(ids).toEqual(['pinterest', 'instagram', 'xhs', 'tiktok', 'generic']);
  });

  it('resolveReferenceProvider returns the most-specific adapter first', () => {
    expect(resolveReferenceProvider('https://www.pinterest.com/pin/1/')?.id).toBe(
      'pinterest'
    );
    expect(resolveReferenceProvider('https://www.instagram.com/p/abc/')?.id).toBe(
      'instagram'
    );
    expect(resolveReferenceProvider('https://xhslink.com/xyz')?.id).toBe('xhs');
    expect(resolveReferenceProvider('https://vm.tiktok.com/abc/')?.id).toBe('tiktok');
    expect(resolveReferenceProvider('https://example.com/')?.id).toBe('generic');
    expect(resolveReferenceProvider('not-a-url')).toBeNull();
  });

  it('ingestReferenceUrl rejects empty / invalid / non-http URLs', async () => {
    await expect(ingestReferenceUrl('')).rejects.toThrow(/url required/);
    await expect(ingestReferenceUrl('   ')).rejects.toThrow(/url required/);
    await expect(ingestReferenceUrl('ftp://example.com')).rejects.toThrow(
      /unsupported URL scheme/
    );
    await expect(ingestReferenceUrl('::::')).rejects.toThrow(/invalid URL/);
  });

  it('routes a pinterest URL through the pinterest adapter and reports providerId', async () => {
    const html = `<html><head>
      <meta property="og:image" content="https://i.pinimg.com/x.jpg" />
      <meta property="og:title" content="Solstice Studio on Pinterest: look 3" />
      <link rel="canonical" href="https://pinterest.com/pin/1/" />
    </head></html>`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(html));
    const outcome = await ingestReferenceUrl('https://www.pinterest.com/pin/1/', {
      fetcher,
    });
    expect(outcome.providerId).toBe('pinterest');
    expect(outcome.fallback).toBe(false);
    expect(outcome.record.kind).toBe('image');
    expect(outcome.record.attribution.source).toBe('pinterest');
  });

  it('falls through to generic when a specific adapter throws', async () => {
    // Pinterest with no og:image — the adapter will throw; registry falls
    // through to generic, which degrades into a link-only embed record.
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('<html><head></head></html>'));
    const outcome = await ingestReferenceUrl('https://www.pinterest.com/pin/2/', {
      fetcher,
    });
    expect(outcome.providerId).toBe('generic');
    expect(outcome.fallback).toBe(true);
    expect(outcome.record.kind).toBe('embed');
  });

  it('returns fallback=false when generic itself finds an og:image', async () => {
    const html =
      '<html><head><meta property="og:image" content="https://cdn.example.com/a.png" /></head></html>';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(html));
    const outcome = await ingestReferenceUrl('https://unknown.example.com/post/1', {
      fetcher,
    });
    expect(outcome.providerId).toBe('generic');
    expect(outcome.fallback).toBe(false);
    expect(outcome.record.kind).toBe('image');
  });
});
