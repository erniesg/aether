import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';
import { ImageGenError } from './types';
import { applyComposition } from './composition';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-3-0-t2i-250415';

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

      const applied = applyComposition(
        { prompt: req.prompt, negativePrompt: req.negativePrompt },
        req.composition ?? {},
        'volcengine'
      );

      const elapsed = mark();
      const res = await fetchWithTimeout(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: applied.prompt,
          size: `${w}x${h}`,
          seed: req.seed,
          guidance_scale: 3,
          response_format: 'url',
          watermark: false,
          ...(applied.extraParams ?? {}),
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
