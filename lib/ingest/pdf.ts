/**
 * PDF ingestion (multimodal v2).
 *
 * Accepts a PDF source (HTTP URL or `data:application/pdf;base64,…`),
 * extracts the full text plus page count + author/title metadata, and
 * returns a structured `PdfIngestion` shape parallel to `UrlIngestion`
 * (lib/ingest/url.ts) so auto-mode can weave it into the variation prompt
 * the same way URLs are.
 *
 * Image extraction is NOT in v1 — pdf-parse exposes text only. If a future
 * release wants embedded product images out of marketing PDFs we'd swap to
 * pdfjs-dist + canvas rendering.
 *
 * Used by auto-mode when `trigger.kind === 'file'` and the file's mime
 * sniffs to `application/pdf`.
 */

// pdf-parse v2 wraps pdfjs-dist which trips Next's server webpack at
// import time ("Object.defineProperty called on non-object"). Lazy-load
// it inside parsePdfIngestion so URL / text / image triggers — which
// don't touch pdf-parse — keep working.
type PDFParseClass = new (input: { data: Uint8Array }) => {
  getText(): Promise<unknown>;
};
let cachedPDFParse: PDFParseClass | null = null;
async function getPDFParse(): Promise<PDFParseClass> {
  if (cachedPDFParse) return cachedPDFParse;
  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse: PDFParseClass;
  };
  cachedPDFParse = mod.PDFParse;
  return cachedPDFParse;
}

export interface PdfIngestion {
  /** Original source (HTTP URL or data: URL). */
  source: string;
  title: string;
  author: string;
  /** Full extracted text. May be many pages of content; downstream weaves
   *  a head-trimmed excerpt into the prompt to keep token budget sane. */
  text: string;
  /** Short head excerpt suitable for prompt injection (default: 1500 chars). */
  textExcerpt: string;
  pageCount: number;
  fetchedAt: string;
  rawBytes: number;
}

const DEFAULT_EXCERPT_CHARS = 1500;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FetchPdfIngestionOptions {
  timeoutMs?: number;
  excerptChars?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Single entry point for PDF ingestion. Routes data URLs through the
 * inline base64 path, HTTP/HTTPS through fetch.
 */
export async function fetchPdfIngestion(
  source: string,
  opts: FetchPdfIngestionOptions = {}
): Promise<PdfIngestion> {
  const bytes = await loadPdfBytes(source, opts);
  return parsePdfIngestion(bytes, source, opts);
}

async function loadPdfBytes(
  source: string,
  opts: FetchPdfIngestionOptions
): Promise<Buffer> {
  if (source.startsWith('data:')) {
    return decodeDataUrl(source);
  }
  const fetchFn = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  let response: Response;
  try {
    response = await fetchFn(source, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'application/pdf',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`pdf ingest: ${source} → HTTP ${response.status}`);
  }
  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}

function decodeDataUrl(dataUrl: string): Buffer {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) {
    throw new Error('pdf ingest: malformed data URL');
  }
  const header = dataUrl.slice(5, commaIdx); // strips 'data:'
  if (!header.toLowerCase().includes('application/pdf')) {
    throw new Error(
      `pdf ingest: data URL is not a PDF (${header.split(';')[0] || 'unknown'})`
    );
  }
  if (!header.includes(';base64')) {
    throw new Error('pdf ingest: data URL must be base64-encoded');
  }
  const payload = dataUrl.slice(commaIdx + 1);
  return Buffer.from(payload, 'base64');
}

export async function parsePdfIngestion(
  bytes: Buffer,
  source: string,
  opts: FetchPdfIngestionOptions = {}
): Promise<PdfIngestion> {
  // pdf-parse v2 is class-based: new PDFParse({data}).getText() returns
  // { text, total (page count), info: { Title, Author, ... } }.
  // Convert Node Buffer → Uint8Array for the parser. Capture byteLength
  // BEFORE the call — PDF.js detaches the underlying ArrayBuffer when
  // parsing finishes, leaving bytes.byteLength reading 0.
  const rawByteCount = bytes.byteLength;
  const PDFParse = await getPDFParse();
  const parser = new PDFParse({
    data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  const parsed = (await parser.getText()) as unknown as Record<string, unknown>;
  const text =
    typeof parsed.text === 'string' ? parsed.text.trim() : '';
  const meta = (parsed.info ?? {}) as Record<string, unknown>;
  const title = typeof meta.Title === 'string' ? meta.Title.trim() : '';
  const author = typeof meta.Author === 'string' ? meta.Author.trim() : '';
  const pageCount =
    typeof parsed.total === 'number'
      ? parsed.total
      : typeof parsed.numpages === 'number'
        ? parsed.numpages
        : 0;
  return {
    source,
    title,
    author,
    text,
    textExcerpt: clampHeadExcerpt(text, opts.excerptChars ?? DEFAULT_EXCERPT_CHARS),
    pageCount,
    fetchedAt: new Date().toISOString(),
    rawBytes: rawByteCount,
  };
}

function clampHeadExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Cut at the last whitespace before the ceiling so we don't slice mid-word.
  const head = text.slice(0, maxChars);
  const lastWs = head.lastIndexOf('\n') >= 0 ? head.lastIndexOf('\n') : head.lastIndexOf(' ');
  return lastWs > maxChars * 0.7 ? head.slice(0, lastWs) + '…' : head + '…';
}
