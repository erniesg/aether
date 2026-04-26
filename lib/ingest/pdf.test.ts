import { describe, expect, it, vi } from 'vitest';
import { fetchPdfIngestion } from './pdf';

const mocks = vi.hoisted(() => {
  const getText = vi.fn();
  // PDFParse is a class — vi.fn() can't be `new`'d, so use a real class
  // whose getText delegates to the spy. Tests set up via mocks.getText.
  class PDFParse {
    getText() {
      return getText();
    }
  }
  return { PDFParse, getText };
});

vi.mock('pdf-parse', () => ({
  PDFParse: mocks.PDFParse,
}));

// Build a fake PDF data URL from arbitrary base64.
function buildPdfDataUrl(base64: string): string {
  return `data:application/pdf;base64,${base64}`;
}

describe('fetchPdfIngestion', () => {
  it('extracts title / author / pageCount + clamps a head excerpt', async () => {
    const longText = 'Pod 4 Ultra. '.repeat(400); // ~5200 chars
    mocks.getText.mockResolvedValueOnce({
      text: longText,
      numpages: 8,
      info: { Title: 'Eight Sleep Spec Sheet', Author: 'Eight Sleep Inc.' },
    });
    const out = await fetchPdfIngestion(buildPdfDataUrl('aGVsbG8='));
    expect(out.title).toBe('Eight Sleep Spec Sheet');
    expect(out.author).toBe('Eight Sleep Inc.');
    expect(out.pageCount).toBe(8);
    expect(out.text).toBe(longText.trim());
    // Default excerpt is 1500 chars; we trim to a word boundary then add ellipsis.
    expect(out.textExcerpt.length).toBeLessThan(1700);
    expect(out.textExcerpt.startsWith('Pod 4 Ultra.')).toBe(true);
    expect(out.textExcerpt.endsWith('…')).toBe(true);
    expect(out.source).toContain('data:application/pdf');
  });

  it('handles short PDFs (excerpt equals full text, no ellipsis)', async () => {
    const shortText = 'Single page PDF. Hello.';
    mocks.getText.mockResolvedValueOnce({
      text: shortText,
      numpages: 1,
      info: {},
    });
    const out = await fetchPdfIngestion(buildPdfDataUrl('YWJj'));
    expect(out.text).toBe(shortText);
    expect(out.textExcerpt).toBe(shortText);
    expect(out.title).toBe('');
    expect(out.author).toBe('');
  });

  it('rejects non-PDF data URLs with a clear error', async () => {
    await expect(
      fetchPdfIngestion('data:image/png;base64,iVBORw0K')
    ).rejects.toThrow(/not a PDF/);
  });

  it('rejects non-base64 data URLs', async () => {
    await expect(
      fetchPdfIngestion('data:application/pdf,raw-bytes')
    ).rejects.toThrow(/base64-encoded/);
  });

  it('fetches HTTP URLs and forwards a browser-like user agent', async () => {
    mocks.getText.mockResolvedValueOnce({
      text: 'fetched',
      numpages: 1,
      info: {},
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === 'string' ? input : (input as URL).toString(),
        init,
      });
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }) as unknown as typeof fetch;
    const out = await fetchPdfIngestion('https://example.com/spec.pdf', {
      fetchImpl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://example.com/spec.pdf');
    expect((calls[0].init?.headers as Record<string, string>)['User-Agent']).toMatch(
      /Chrome/
    );
    expect(out.text).toBe('fetched');
  });

  it('throws on non-2xx fetch responses', async () => {
    const fetchImpl = (async () =>
      new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    await expect(
      fetchPdfIngestion('https://example.com/locked.pdf', { fetchImpl })
    ).rejects.toThrow(/HTTP 403/);
  });
});
