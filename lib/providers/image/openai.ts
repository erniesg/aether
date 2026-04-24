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
const OPENAI_TIMEOUT_MS = 300_000;
const IMAGE_2_MULTIPLE = 16;
const IMAGE_2_MIN_SIDE = 256;
const IMAGE_2_MAX_SIDE = 3840;
const IMAGE_2_MAX_GENERATE_PIXELS = 9_437_184;
const IMAGE_2_MAX_EDIT_PIXELS = 4_194_304;

type OpenAISize = '1024x1024' | '1024x1536' | '1536x1024' | `${number}x${number}`;
type OpenAISizePurpose = 'generate' | 'edit';

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

function isGPTImage2(model: string) {
  return model === 'gpt-image-2' || model.startsWith('gpt-image-2-');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToMultiple(value: number, multiple: number) {
  return Math.round(value / multiple) * multiple;
}

function floorToMultiple(value: number, multiple: number) {
  return Math.floor(value / multiple) * multiple;
}

function normalizeImage2Side(value: number) {
  return clamp(
    roundToMultiple(value, IMAGE_2_MULTIPLE),
    IMAGE_2_MIN_SIDE,
    IMAGE_2_MAX_SIDE
  );
}

function normalizeImage2DesiredSize(req: ImageGenRequest) {
  const fallback = dimsFromAspect(req.aspectRatio);
  const source = req.size ?? fallback;
  let w = Number.isFinite(source.w) && source.w > 0 ? source.w : fallback.w;
  let h = Number.isFinite(source.h) && source.h > 0 ? source.h : fallback.h;

  if (w / h > 4) {
    h = w / 4;
  } else if (w / h < 0.25) {
    w = h / 4;
  }

  return {
    w: clamp(w, IMAGE_2_MIN_SIDE, IMAGE_2_MAX_SIDE),
    h: clamp(h, IMAGE_2_MIN_SIDE, IMAGE_2_MAX_SIDE),
  };
}

function scaleImage2SizeToPixelCap(
  size: { w: number; h: number },
  maxPixels: number
) {
  if (size.w * size.h <= maxPixels) return size;

  const scale = Math.sqrt(maxPixels / (size.w * size.h));
  return {
    w: Math.max(
      IMAGE_2_MIN_SIDE,
      floorToMultiple(size.w * scale, IMAGE_2_MULTIPLE)
    ),
    h: Math.max(
      IMAGE_2_MIN_SIDE,
      floorToMultiple(size.h * scale, IMAGE_2_MULTIPLE)
    ),
  };
}

function candidateImage2Sizes(w: number, h: number) {
  const ratio = w / h;
  const widths = new Set([
    floorToMultiple(w, IMAGE_2_MULTIPLE),
    normalizeImage2Side(w),
    Math.ceil(w / IMAGE_2_MULTIPLE) * IMAGE_2_MULTIPLE,
  ]);
  const heights = new Set([
    floorToMultiple(h, IMAGE_2_MULTIPLE),
    normalizeImage2Side(h),
    Math.ceil(h / IMAGE_2_MULTIPLE) * IMAGE_2_MULTIPLE,
  ]);
  const candidates: Array<{ w: number; h: number }> = [];

  for (const candidateW of widths) {
    const normalizedW = clamp(candidateW, IMAGE_2_MIN_SIDE, IMAGE_2_MAX_SIDE);
    candidates.push({
      w: normalizedW,
      h: normalizeImage2Side(normalizedW / ratio),
    });
  }

  for (const candidateH of heights) {
    const normalizedH = clamp(candidateH, IMAGE_2_MIN_SIDE, IMAGE_2_MAX_SIDE);
    candidates.push({
      w: normalizeImage2Side(normalizedH * ratio),
      h: normalizedH,
    });
  }

  candidates.push({
    w: normalizeImage2Side(w),
    h: normalizeImage2Side(h),
  });

  return candidates.filter(
    (candidate) =>
      candidate.w >= IMAGE_2_MIN_SIDE &&
      candidate.h >= IMAGE_2_MIN_SIDE &&
      candidate.w <= IMAGE_2_MAX_SIDE &&
      candidate.h <= IMAGE_2_MAX_SIDE &&
      candidate.w % IMAGE_2_MULTIPLE === 0 &&
      candidate.h % IMAGE_2_MULTIPLE === 0 &&
      candidate.w / candidate.h >= 0.25 &&
      candidate.w / candidate.h <= 4
  );
}

function pickGPTImage2Size(
  req: ImageGenRequest,
  purpose: OpenAISizePurpose
): {
  size: OpenAISize;
  width: number;
  height: number;
} {
  const desired = normalizeImage2DesiredSize(req);
  const maxPixels =
    purpose === 'edit' ? IMAGE_2_MAX_EDIT_PIXELS : IMAGE_2_MAX_GENERATE_PIXELS;
  const scaled = scaleImage2SizeToPixelCap(desired, maxPixels);
  const candidates = candidateImage2Sizes(scaled.w, scaled.h).filter(
    (candidate) => candidate.w * candidate.h <= maxPixels
  );
  const targetRatio = desired.w / desired.h;
  const best = candidates.reduce<{ w: number; h: number } | null>(
    (current, candidate) => {
      if (!current) return candidate;
      const score = (value: { w: number; h: number }) => {
        const aspectDelta = Math.abs(value.w / value.h - targetRatio) / targetRatio;
        const sizeDelta =
          Math.abs(value.w - scaled.w) / scaled.w +
          Math.abs(value.h - scaled.h) / scaled.h;
        const undersizePenalty =
          (value.w < scaled.w ? 0.1 : 0) + (value.h < scaled.h ? 0.1 : 0);
        return aspectDelta * 100 + sizeDelta + undersizePenalty;
      };
      return score(candidate) < score(current) ? candidate : current;
    },
    null
  ) ?? { w: 1024, h: 1024 };

  return {
    size: `${best.w}x${best.h}`,
    width: best.w,
    height: best.h,
  };
}

function pickOpenAISize(
  req: ImageGenRequest,
  model: string,
  purpose: OpenAISizePurpose
): {
  size: OpenAISize;
  width: number;
  height: number;
} {
  if (isGPTImage2(model)) {
    return pickGPTImage2Size(req, purpose);
  }

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

    // OpenAI's edit endpoint only accepts uploaded image files. The composer
    // sends ad-hoc refs as base64 data URLs, so only those should route to
    // multipart edits. Any other ref shape is ignored here and the request
    // falls back to plain text generation instead of crashing on coercion.
    const refs = (req.refs ?? []).filter(
      (r): r is ImageRef => isBase64DataUrl(r?.url)
    );
    const { size, width, height } = pickOpenAISize(
      req,
      model,
      refs.length > 0 ? 'edit' : 'generate'
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
    const { size, width, height } = pickOpenAISize(req, model, 'edit');

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
