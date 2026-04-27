import type { ImageGenProvider, ImageGenRequest, ImageGenResult, ImageRef } from './types';
import { ImageGenError } from './types';
import { applyComposition } from './composition';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const DEFAULT_MODEL = 'gpt-image-2';
// gpt-image-2 hero renders typically take 100-150s for 1024² with the
// layout-aware prompt, but /v1/images/edits with multiple large refs
// (e.g. 7MB + 4MB brand PNGs) can exceed 240s — the upload + processing
// adds significant tail latency. Bumped 240s → 600s default 2026-04-27
// after observing repeat "request timed out after 240s" failures on
// the dingman+joe lap (11MB combined refs). Override via env.
const OPENAI_TIMEOUT_MS = (() => {
  const raw = process.env.OPENAI_IMAGE_TIMEOUT_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 600_000;
})();
/**
 * Size string accepted by gpt-image-2's `size` parameter — `"<W>x<H>"` where
 * both edges are multiples of 16, max edge ≤ 3840, long-to-short ratio ≤ 3:1,
 * and total pixels in [655_360, 8_294_400]. The legacy gpt-image-1 fixed
 * sizes (1024x1024 / 1024x1536 / 1536x1024) all satisfy these rules so the
 * adapter still works against gpt-image-1 without a model-specific branch.
 */
type OpenAISize = `${number}x${number}`;

const SIZE_MIN_PIXELS = 655_360;
const SIZE_MAX_PIXELS = 8_294_400;
const SIZE_MAX_EDGE = 3840;

/** Round `n` UP to the nearest multiple of 16 (gpt-image-2 size constraint). */
function roundUpTo16(n: number): number {
  return Math.max(16, Math.ceil(n / 16) * 16);
}

/**
 * Best-effort fit a requested (w, h) into gpt-image-2's constraints:
 *   - both edges multiples of 16
 *   - long edge ≤ 3840
 *   - long-to-short ratio ≤ 3:1
 *   - total pixels in [655_360, 8_294_400]
 *
 * Preserves aspect ratio. Used when the caller wants exact native dims
 * (e.g. 1080×1350 for 4:5) — we round each edge to the nearest multiple
 * of 16 (1088×1360) which still maps to 4:5 within ~0.5% tolerance, then
 * scale up to satisfy the lower pixel bound or down to satisfy the upper.
 */
function fitToGptImage2Size(
  reqW: number,
  reqH: number
): { size: OpenAISize; width: number; height: number } {
  let w = roundUpTo16(reqW);
  let h = roundUpTo16(reqH);
  // Cap each edge.
  if (w > SIZE_MAX_EDGE) {
    h = Math.round((h * SIZE_MAX_EDGE) / w);
    w = SIZE_MAX_EDGE;
  }
  if (h > SIZE_MAX_EDGE) {
    w = Math.round((w * SIZE_MAX_EDGE) / h);
    h = SIZE_MAX_EDGE;
  }
  // Re-round after the edge cap.
  w = roundUpTo16(w);
  h = roundUpTo16(h);
  // Scale up to meet the minimum pixel count (gpt-image-2 rejects tiny).
  let pixels = w * h;
  if (pixels < SIZE_MIN_PIXELS) {
    const k = Math.sqrt(SIZE_MIN_PIXELS / pixels);
    w = roundUpTo16(w * k);
    h = roundUpTo16(h * k);
    pixels = w * h;
  }
  // Scale down to meet the maximum pixel count.
  if (pixels > SIZE_MAX_PIXELS) {
    const k = Math.sqrt(SIZE_MAX_PIXELS / pixels);
    // Round DOWN here so we stay under the cap.
    w = Math.max(16, Math.floor((w * k) / 16) * 16);
    h = Math.max(16, Math.floor((h * k) / 16) * 16);
  }
  return { size: `${w}x${h}` as OpenAISize, width: w, height: h };
}

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

/**
 * Pick the `size` parameter for OpenAI's images API.
 *
 * gpt-image-2 accepts ANY pixel size that satisfies the docs' constraints
 * (multiples of 16, ≤ 3840 max edge, ratio ≤ 3:1, 655K–8.3M total pixels).
 * Historically (gpt-image-1) we collapsed everything into three canonical
 * sizes (1024², 1024×1536, 1536×1024) which silently coerced 4:5 → 2:3
 * and 9:16 → 2:3 — the source of the demo's "all portraits look the same
 * shape" bug. We now pass the requested dimensions through, snapped to the
 * gpt-image-2 grid, so a 4:5 ask returns ~1024×1280 and 9:16 returns
 * ~1024×1792.
 */
function pickOpenAISize(req: ImageGenRequest): {
  size: OpenAISize;
  width: number;
  height: number;
} {
  const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);
  if (!w || !h) {
    return { size: '1024x1024', width: 1024, height: 1024 };
  }
  return fitToGptImage2Size(w, h);
}

/**
 * Convert a `data:<mime>;base64,<payload>` URL into a `Blob` so it can ride
 * a multipart FormData. Thrown ImageGenError on malformed input keeps the
 * provider's error surface consistent with the rest of the path.
 */
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const parsed = parseBase64DataUrl(dataUrl);
  if (!parsed) {
    throw new ImageGenError('ref image must be a base64 data URL', 'openai');
  }
  const buf = Buffer.from(parsed.payload, 'base64');
  const mime = parsed.mime;
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'png';
  // Buffer is a Uint8Array subclass — Blob accepts it directly on Node 20+.
  return { blob: new Blob([buf], { type: mime }), ext };
}

/**
 * Fetch any https/http URL and convert the response bytes into a Blob for
 * multipart upload. OpenAI's /v1/images/edits endpoint does NOT URL-fetch
 * refs server-side — it expects multipart bytes — so we have to do the
 * fetch ourselves before submitting.
 *
 * Used by the per-format / hero-anchor pipeline to feed Convex storage
 * URLs (the agent's just-uploaded heroes) into edits as identity-anchors.
 * Without this path, the previous adapter silently dropped any non-data:
 * ref, falling through to /generations and losing hero identity. Bug
 * surfaced 2026-04-27 via "different shoot per aspect" complaints.
 */
async function urlToBlob(url: string): Promise<{ blob: Blob; ext: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { method: 'GET' }, OPENAI_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new ImageGenError(
        `ref fetch timed out after ${OPENAI_TIMEOUT_MS / 1000}s: ${url}`,
        'openai',
        error
      );
    }
    throw new ImageGenError(
      `ref fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      'openai',
      error
    );
  }
  if (!res.ok) {
    throw new ImageGenError(
      `ref fetch returned HTTP ${res.status} for ${url}`,
      'openai'
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') ?? 'image/png';
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'png';
  return { blob: new Blob([buf], { type: mime }), ext };
}

async function refToBlob(ref: ImageRef): Promise<{ blob: Blob; ext: string }> {
  if (isBase64DataUrl(ref.url)) {
    return dataUrlToBlob(ref.url);
  }
  return urlToBlob(ref.url);
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
    // gpt-image-2 only — gpt-image-1 was dropped because its size param
    // collapsed every aspect into one of three fixed canvases (1024² /
    // 1024×1536 / 1536×1024), and dall-e-3 has the same fixed-size
    // limitation. Custom aspect ratios for the SG multiformat fan-out
    // require gpt-image-2's free-pixel-size mode.
    listModels: () => ['gpt-image-2'],
  };

  async function generate(req: ImageGenRequest, opts: { model: string }): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');
    const model = opts.model || DEFAULT_MODEL;
    const { size, width, height } = pickOpenAISize(req);
    const applied = applyComposition(
      { prompt: req.prompt, negativePrompt: req.negativePrompt },
      req.composition ?? {},
      'openai'
    );

    // OpenAI's edit endpoint accepts uploaded bytes only — no URL pull. We
    // accept BOTH data: URLs (from the composer / direct fixtures) AND
    // https/http URLs (from the auto-mode lap, where heroes / brand refs
    // sit on Convex storage and the lap passes their public URLs). The
    // refToBlob path inside editWithRefs handles each case. The previous
    // filter (data: only) silently dropped lap-supplied URL refs and the
    // call fell through to /generations — losing hero identity anchoring.
    const refs = (req.refs ?? []).filter(
      (r): r is ImageRef => typeof r?.url === 'string' && r.url.length > 0
    );
    // eslint-disable-next-line no-console
    console.log(
      `[openai/generate] model=${model} size=${size} refs=${refs.length} promptLen=${applied.prompt.length}`
    );
    refs.forEach((r, i) => {
      const isData = r.url.startsWith('data:');
      const sig = isData
        ? `data:${r.url.slice(5, 25)}…(${Math.round(r.url.length / 1024)}KB b64)`
        : r.url.slice(0, 80);
      // eslint-disable-next-line no-console
      console.log(`[openai/generate]   ref[${i}] ${isData ? 'DATA' : 'URL'} → ${sig}`);
    });
    if (refs.length > 0) {
      return editWithRefs(req, refs, model, size, width, height, applied.prompt);
    }

    return generateWithoutRefs(req, model, size, width, height, applied.prompt);
  }

  async function generateWithoutRefs(
    req: ImageGenRequest,
    model: string,
    size: OpenAISize,
    width: number,
    height: number,
    prompt: string = req.prompt
  ): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');
    const elapsed = mark();
    const res = await fetchOpenAI(GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
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
   * `image[]` multipart parts — gpt-image-2 accepts that shape. Each ref
   * arrives as a base64 data URL from the client; we decode and attach as
   * Blobs. Response shape matches generations.
   */
  async function editWithRefs(
    req: ImageGenRequest,
    refs: ImageRef[],
    model: string,
    size: OpenAISize,
    width: number,
    height: number,
    prompt: string = req.prompt
  ): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('n', String(req.n ?? 1));
    form.append('size', size);
    form.append('quality', 'high');
    // Resolve each ref to bytes — data: URLs decode locally, http/https
    // URLs (e.g. Convex storage URLs the auto-mode lap passes) get
    // server-side fetched here. Done in parallel so wall time is bounded
    // by the slowest fetch, not the sum.
    //
    // Fail-soft per ref (2026-04-27): a single 404 / network error on one
    // ref must NOT kill the whole call — we drop the bad ref and proceed
    // with whichever refs survived. Brand-reference scrapers (Eight Sleep,
    // IKEA, etc.) routinely hand us stale image URLs that 404 at fetch
    // time; previously this surfaced as "openai: ref fetch returned HTTP
    // 404" → variation.failed → lap.failed even though the call could have
    // succeeded with the other refs. If ALL refs fail, fall back to plain
    // /generations (no edits) instead of crashing.
    const settled = await Promise.allSettled(
      refs.map((ref) => refToBlob(ref))
    );
    const usable: Array<{ blob: Blob; ext: string }> = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        usable.push(r.value);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[openai] ref ${i} fetch failed, dropping: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
        );
      }
    });
    if (usable.length === 0) {
      // All refs failed — drop to /generations so the lap can still produce
      // SOMETHING instead of bubbling a hard fail.
      // eslint-disable-next-line no-console
      console.warn(
        `[openai] all ${refs.length} refs failed to fetch — falling back to /generations`
      );
      // Fall through by re-issuing as a generations call. We synthesize the
      // minimal generations request here so we don't need a method-level
      // recursion guard.
      return generateWithoutRefs(req, model, size, width, height, prompt);
    }
    usable.forEach(({ blob, ext }, i) => {
      form.append('image[]', blob, `ref-${i}.${ext}`);
    });

    // eslint-disable-next-line no-console
    console.log(
      `[openai/edits] POST → ${EDITS_ENDPOINT} model=${model} size=${size} image[]=${usable.length} (bytes per ref: ${usable.map((u) => u.blob.size).join(', ')}) prompt[0..120]=${prompt.slice(0, 120).replace(/\s+/g, ' ')}`
    );

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

  return { ...common, generate };
}
