import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'gpt-image-1';

/** OpenAI Images API adapter. */
export function createOpenAIProvider(
  apiKey: string | undefined = process.env.OPENAI_API_KEY
): ImageGenProvider {
  return {
    id: 'openai',
    displayName: 'OpenAI Images',
    isAvailable: () => Boolean(apiKey),
    listModels: () => ['gpt-image-1', 'dall-e-3'],

    async generate(req: ImageGenRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('OPENAI_API_KEY not set', 'openai');
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
    },
  };
}
