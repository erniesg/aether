import type {
  ImageEditRequest,
  ImageGenProvider,
  ImageGenRequest,
  ImageGenResult,
} from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-3-0-t2i-250415';
const DEFAULT_EDIT_MODEL = 'doubao-seededit-3-0-i2i-250628';

/**
 * ByteDance / Volcengine Ark image generation (Seedream family).
 * OpenAI-compatible `/images/generations` endpoint.
 * Docs: https://www.volcengine.com/docs/82379/1541523
 */
export function createVolcengineProvider(
  apiKey: string | undefined = process.env.VOLCENGINE_ARK_API_KEY
): ImageGenProvider {
  return {
    id: 'volcengine',
    displayName: 'Volcengine Ark · Seedream',
    isAvailable: () => Boolean(apiKey),
    listModels: () => [
      'doubao-seedream-3-0-t2i-250415',
      'doubao-seedream-4-0-250828',
      'doubao-seededit-3-0-i2i-250628',
    ],

    async generate(req: ImageGenRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('VOLCENGINE_ARK_API_KEY not set', 'volcengine');
      const model = opts.model || DEFAULT_MODEL;
      const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);

      const elapsed = mark();
      const res = await fetchWithTimeout(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          size: `${w}x${h}`,
          seed: req.seed,
          guidance_scale: 3,
          response_format: 'url',
          watermark: false,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ImageGenError(`${res.status} ${text}`, 'volcengine');
      }

      type VolcResp = { data?: Array<{ url?: string; b64_json?: string }> };
      const json = (await res.json()) as VolcResp;
      const data = json.data ?? [];
      if (data.length === 0) throw new ImageGenError('no images returned', 'volcengine');

      return {
        provider: 'volcengine',
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
    },

    /**
     * SeedEdit 3.0 image-to-image. The Ark `/images/generations` endpoint
     * accepts a source image URL via the `image` field when the SeedEdit
     * model is selected. `maskUrl` is accepted on the contract but ignored
     * here — SeedEdit relies on the prompt to describe the region; the
     * caller should route through OpenAI (or wait for Slice C2) for a
     * true per-pixel mask edit.
     */
    async edit(req: ImageEditRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('VOLCENGINE_ARK_API_KEY not set', 'volcengine');
      if (!req.sourceUrl) throw new ImageGenError('sourceUrl is required for edit', 'volcengine');
      const model = opts.model || DEFAULT_EDIT_MODEL;
      if (req.maskUrl) {
        // Best-effort: warn but proceed with a global prompt-driven edit.
        // eslint-disable-next-line no-console
        console.warn(
          '[volcengine] seededit does not accept maskUrl; continuing with prompt-guided global edit'
        );
      }
      const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);

      const elapsed = mark();
      const res = await fetchWithTimeout(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          image: req.sourceUrl,
          seed: req.seed,
          response_format: 'url',
          watermark: false,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ImageGenError(`${res.status} ${text}`, 'volcengine');
      }

      type VolcResp = { data?: Array<{ url?: string; b64_json?: string }> };
      const json = (await res.json()) as VolcResp;
      const data = json.data ?? [];
      if (data.length === 0) throw new ImageGenError('no images returned', 'volcengine');

      return {
        provider: 'volcengine',
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
    },
  };
}
