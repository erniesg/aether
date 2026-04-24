import type {
  ImageEditRequest,
  ImageGenProvider,
  ImageGenRequest,
  ImageGenResult,
  ImageRef,
} from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const DEFAULT_MODEL = 'gpt-image-1';
const OPENAI_TIMEOUT_MS = 120_000;
type OpenAISize = '1024x1024' | '1024x1536' | '1536x1024';

function parseBase64DataUrl(value: unknown): { mime: string; payload: string } | null {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    return null;
  }
  const commaIdx = value.indexOf(',');
  if (commaIdx <= 5 || commaIdx === value.length - 1) {
    return null;
  }
  const header = value.slice(5, commaIdx);
  if (!header.includes(';base64')) {
    return null;
  }
  const mime = header.split(';', 1)[0] || 'image/png';
  return { mime, payload: value.slice(commaIdx + 1) };
}

function isBase64DataUrl(value: unknown): value is string {
  return parseBase64DataUrl(value) !== null;
}

function isAbortError(error: unknown): error is { name: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function pickOpenAISize(req: ImageGenRequest): {
  size: OpenAISize;
  width: number;
  height: number;
} {
  const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);
  if (!w || !h) {
    return { size: '1024x1024', width: 1024, height: 1024 };
  }
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.12) {
    return { size: '1024x1024', width: 1024, height: 1024 };
  }
  if (ratio > 1) {
    return { size: '1536x1024', width: 1536, height: 1024 };
  }
  return { size: '1024x1536', width: 1024, height: 1536 };
}

/**
 * Convert a `data:<mime>;base64,<payload>` URL into a `Blob` so it can ride
 * a multipart FormData. Thrown ImageGenError on malformed input keeps the
 * provider's error surface consistent with the rest of the path.
 */
function dataUrlToBlob(
  dataUrl: string,
  label = 'ref image'
): { blob: Blob; ext: string } {
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed) {
    throw new ImageGenError(`${label} must be a base64 data URL`, 'openai');
  }
  const buf = Buffer.from(parsed.payload, 'base64');
  const mime = parsed.mime;
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'png';
  // Buffer is a Uint8Array subclass — Blob accepts it directly on Node 20+.
  return { blob: new Blob([buf], { type: mime }), ext };
}

export async function normalizeMaskBufferForOpenAI(
  dataUrl: string
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed) {
    throw new ImageGenError('mask image must be a base64 data URL', 'openai');
  }

  const original = Buffer.from(parsed.payload, 'base64');
  if (parsed.mime !== 'image/png') {
    return {
      buffer: original,
      mime: parsed.mime,
      ext: parsed.mime.split('/')[1]?.split('+')[0] ?? 'png',
    };
  }

  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(original)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels >= 4) {
    return { buffer: original, mime: 'image/png', ext: 'png' };
  }

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let index = 0; index < info.width * info.height; index += 1) {
    const srcOffset = index * info.channels;
    const dstOffset = index * 4;

    if (info.channels === 1) {
      const value = data[srcOffset] ?? 0;
      rgba[dstOffset] = value;
      rgba[dstOffset + 1] = value;
      rgba[dstOffset + 2] = value;
      rgba[dstOffset + 3] = value;
      continue;
    }

    if (info.channels === 2) {
      const value = data[srcOffset] ?? 0;
      rgba[dstOffset] = value;
      rgba[dstOffset + 1] = value;
      rgba[dstOffset + 2] = value;
      rgba[dstOffset + 3] = data[srcOffset + 1] ?? value;
      continue;
    }

    const r = data[srcOffset] ?? 0;
    const g = data[srcOffset + 1] ?? 0;
    const b = data[srcOffset + 2] ?? 0;
    rgba[dstOffset] = r;
    rgba[dstOffset + 1] = g;
    rgba[dstOffset + 2] = b;
    rgba[dstOffset + 3] = Math.max(r, g, b);
  }

  const normalized = await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  return { buffer: normalized, mime: 'image/png', ext: 'png' };
}

export async function normalizeMaskBlobForOpenAI(
  dataUrl: string
): Promise<{ blob: Blob; ext: string }> {
  const normalized = await normalizeMaskBufferForOpenAI(dataUrl);
  return {
    blob: new Blob([new Uint8Array(normalized.buffer)], { type: normalized.mime }),
    ext: normalized.ext,
  };
}

async function fetchOpenAI(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, OPENAI_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new ImageGenError(
        `request timed out after ${OPENAI_TIMEOUT_MS / 1000}s`,
        'openai',
        error
      );
    }
    throw error;
  }
}

/** OpenAI Images API adapter — handles both text-only and multimodal-edit paths. */
export function createOpenAIProvider(
  apiKey: string | undefined = process.env.OPENAI_API_KEY
): ImageGenProvider {
  const common = {
    id: 'openai',
    displayName: 'OpenAI Images',
    isAvailable: () => Boolean(apiKey),
    // gpt-image-1 stays first so it remains the default until an OpenAI org
    // is verified for gpt-image-2. Pass ?model=gpt-image-2 to opt in once
    // verification propagates.
    listModels: () => ['gpt-image-1', 'gpt-image-2', 'dall-e-3'],
  };

  async function generate(req: ImageGenRequest, opts: { model: string }): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');
    const model = opts.model || DEFAULT_MODEL;
    const { size, width, height } = pickOpenAISize(req);

    // OpenAI's edit endpoint only accepts uploaded image files. The composer
    // sends ad-hoc refs as base64 data URLs, so only those should route to
    // multipart edits. Any other ref shape is ignored here and the request
    // falls back to plain text generation instead of crashing on coercion.
    const refs = (req.refs ?? []).filter(
      (r): r is ImageRef => isBase64DataUrl(r?.url)
    );
    if (refs.length > 0) {
      return editWithRefs(req, refs, model, size, width, height);
    }

    const elapsed = mark();
    const res = await fetchOpenAI(GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: req.prompt,
        n: req.n ?? 1,
        size,
        quality: 'high',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ImageGenError(`${res.status} ${text}`, 'openai');
    }
    type OAResp = { data?: Array<{ url?: string; b64_json?: string }> };
    const json = (await res.json()) as OAResp;
    const data = json.data ?? [];
    if (data.length === 0) throw new ImageGenError('no images returned', 'openai');
    return {
      provider: 'openai',
      model,
      latencyMs: elapsed(),
      images: data.map((img) => ({
        url: img.url ?? (img.b64_json ? `data:image/png;base64,${img.b64_json}` : ''),
        dataUrl: img.b64_json ? `data:image/png;base64,${img.b64_json}` : undefined,
        mimeType: 'image/png',
        width,
        height,
      })),
      raw: json,
    };
  }

  /**
   * Multi-image edit path. Routes to `/v1/images/edits` with repeated
   * `image[]` multipart parts — the shape gpt-image-2 + gpt-image-1 both
   * accept. Each ref arrives as a base64 data URL from the client; we
   * decode and attach as Blobs. Response shape matches generations.
   */
  async function editWithRefs(
    req: ImageGenRequest,
    refs: ImageRef[],
    model: string,
    size: OpenAISize,
    width: number,
    height: number
  ): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', req.prompt);
    form.append('n', String(req.n ?? 1));
    form.append('size', size);
    form.append('quality', 'high');
    refs.forEach((ref, i) => {
      const { blob, ext } = dataUrlToBlob(ref.url);
      form.append('image[]', blob, `ref-${i}.${ext}`);
    });

    const elapsed = mark();
    const res = await fetchOpenAI(EDITS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ImageGenError(`${res.status} ${text}`, 'openai');
    }
    type OAResp = { data?: Array<{ url?: string; b64_json?: string }> };
    const json = (await res.json()) as OAResp;
    const data = json.data ?? [];
    if (data.length === 0) throw new ImageGenError('no images returned', 'openai');
    return {
      provider: 'openai',
      model,
      latencyMs: elapsed(),
      images: data.map((img) => ({
        url: img.url ?? (img.b64_json ? `data:image/png;base64,${img.b64_json}` : ''),
        dataUrl: img.b64_json ? `data:image/png;base64,${img.b64_json}` : undefined,
        mimeType: 'image/png',
        width,
        height,
      })),
      raw: json,
    };
  }

  async function edit(
    req: ImageEditRequest,
    opts: { model: string }
  ): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');
    const model = opts.model || DEFAULT_MODEL;
    const { size, width, height } = pickOpenAISize(req);

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', req.prompt);
    form.append('n', String(req.n ?? 1));
    form.append('size', size);
    form.append('quality', 'high');

    const source = dataUrlToBlob(req.sourceUrl, 'source image');
    form.append('image', source.blob, `source.${source.ext}`);

    if (req.maskUrl) {
      const mask = await normalizeMaskBlobForOpenAI(req.maskUrl);
      form.append('mask', mask.blob, `mask.${mask.ext}`);
    }

    const elapsed = mark();
    const res = await fetchOpenAI(EDITS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ImageGenError(`${res.status} ${text}`, 'openai');
    }
    type OAResp = { data?: Array<{ url?: string; b64_json?: string }> };
    const json = (await res.json()) as OAResp;
    const data = json.data ?? [];
    if (data.length === 0) throw new ImageGenError('no images returned', 'openai');
    return {
      provider: 'openai',
      model,
      latencyMs: elapsed(),
      images: data.map((img) => ({
        url: img.url ?? (img.b64_json ? `data:image/png;base64,${img.b64_json}` : ''),
        dataUrl: img.b64_json ? `data:image/png;base64,${img.b64_json}` : undefined,
        mimeType: 'image/png',
        width,
        height,
      })),
      raw: json,
    };
  }

  return { ...common, generate, edit };
}
