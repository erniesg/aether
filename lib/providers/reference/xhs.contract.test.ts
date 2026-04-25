import { describe, expect, it, vi } from 'vitest';
import { createXhsProvider } from './xhs';
import { ReferenceIngestError } from './types';

const NOTE_HTML = `<!doctype html>
<html><head>
  <link rel="canonical" href="https://www.xiaohongshu.com/explore/abcd1234" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="黄昏护肤 | 3步夜间保养" />
  <meta property="og:description" content="by @solstice_skin on 小红书" />
  <meta property="og:image" content="https://sns-img-bd.xhscdn.com/abcdef.jpg" />
  <meta name="author" content="Solstice Skin" />
</head><body></body></html>`;

const VIDEO_HTML = `<!doctype html>
<html><head>
  <link rel="canonical" href="https://www.xiaohongshu.com/explore/video-12345" />
  <meta property="og:type" content="video.other" />
  <meta property="og:image" content="https://sns-img-bd.xhscdn.com/thumb.jpg" />
</head><body></body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

describe('xhs adapter · contract', () => {
  const provider = createXhsProvider();

  it('canHandle matches xiaohongshu.com, xhslink.com, xhs.cn', () => {
    expect(provider.canHandle('https://www.xiaohongshu.com/explore/abcd1234')).toBe(true);
    expect(provider.canHandle('https://xhslink.com/abcDE')).toBe(true);
    expect(provider.canHandle('https://xhs.cn/note/x')).toBe(true);
    expect(provider.canHandle('https://example.com/xhs')).toBe(false);
  });

  it('parses a note into an image ReferenceRecord with attribution', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(NOTE_HTML));
    const record = await provider.fetch('https://xhslink.com/abcDE', { fetcher });

    expect(record.kind).toBe('image');
    expect(record.previewUrl).toBe('https://sns-img-bd.xhscdn.com/abcdef.jpg');
    expect(record.fullUrl).toBe('https://www.xiaohongshu.com/explore/abcd1234');
    expect(record.attribution.source).toBe('xhs');
    // author meta wins over parsed @handle
    expect(record.attribution.author).toBe('Solstice Skin');
    expect(record.id).toMatch(/^ref_xhs_/);
  });

  it('marks og:type=video.* as video kind', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(VIDEO_HTML));
    const record = await provider.fetch('https://www.xiaohongshu.com/explore/video-12345', {
      fetcher,
    });
    expect(record.kind).toBe('video');
  });

  it('throws ReferenceIngestError when og:image is missing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('<html><head></head></html>'));
    await expect(
      provider.fetch('https://www.xiaohongshu.com/explore/empty', { fetcher })
    ).rejects.toBeInstanceOf(ReferenceIngestError);
  });
});
