import type { ImageGenProvider, ImageGenRequest, ImageGenResult, ImageRef } from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';
const DEFAULT_MODEL = 'gpt-image-1';

/**
 * Convert a `data:<mime>;base64,<payload>` URL into a `Blob` so it can ride
 * a multipart FormData. Thrown ImageGenError on malformed input keeps the
 * provider's error surface consistent with the rest of the path.
 */
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) {
    throw new ImageGenError('ref image must be a base64 data URL', 'openai');
  }
  const mime = m[1] ?? 'image/png';
  const buf = Buffer.from(m[2] ?? '', 'base64');
  const ext = mime.split('/')[1]?.split('+')[0] ?? 'png';
  // Buffer is a Uint8Array subclass — Blob accepts it directly on Node 20+.
  return { blob: new Blob([buf], { type: mime }), ext };
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
    const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);

    const refs = (req.refs ?? []).filter((r): r is ImageRef => Boolean(r?.url));
    if (refs.length > 0) {
      return editWithRefs(req, refs, model, w, h);
    }

    const elapsed = mark();
    const res = await fetchWithTimeout(GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: req.prompt,
        n: req.n ?? 1,
        size: `${w}x${h}`,
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
        width: w,
        height: h,
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
    w: number,
    h: number
  ): Promise<ImageGenResult> {
    if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', req.prompt);
    form.append('n', String(req.n ?? 1));
    form.append('size', `${w}x${h}`);
    form.append('quality', 'high');
    refs.forEach((ref, i) => {
      const { blob, ext } = dataUrlToBlob(ref.url);
      form.append('image[]', blob, `ref-${i}.${ext}`);
    });

    const elapsed = mark();
    const res = await fetchWithTimeout(EDITS_ENDPOINT, {
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
        width: w,
        height: h,
      })),
      raw: json,
    };
  }

  return { ...common, generate };
}
