import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const DEFAULT_MODEL = 'imagen-4.0-generate-001';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Google Imagen adapter via the Gemini API.
 * Docs: https://ai.google.dev/api/generate-images
 */
export function createGeminiProvider(
  apiKey: string | undefined = process.env.GOOGLE_GEMINI_API_KEY
): ImageGenProvider {
  return {
    id: 'gemini',
    displayName: 'Google Imagen / Gemini Image',
    isAvailable: () => Boolean(apiKey),
    listModels: () => [
      'imagen-4.0-generate-001',
      'imagen-4.0-fast-generate-001',
      'imagen-3.0-generate-002',
      'gemini-2.5-flash-image-preview',
    ],

    async generate(req: ImageGenRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('GOOGLE_GEMINI_API_KEY not set', 'gemini');
      const model = opts.model || DEFAULT_MODEL;
      const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);
      const count = req.n ?? 1;

      // Imagen only accepts: 1:1, 9:16, 16:9, 4:3, 3:4. Map the nearest
      // semantic neighbour for ratios it doesn't natively support.
      const ASPECT_MAP: Record<string, '1:1' | '9:16' | '16:9' | '4:3' | '3:4'> = {
        '1:1': '1:1',
        '9:16': '9:16',
        '16:9': '16:9',
        '4:3': '4:3',
        '3:4': '3:4',
        '4:5': '3:4',
        '2:3': '3:4',
        '3:2': '4:3',
      };
      const aspectForProvider = req.aspectRatio && ASPECT_MAP[req.aspectRatio] ? ASPECT_MAP[req.aspectRatio] : '1:1';

      const elapsed = mark();
      const res = await fetchWithTimeout(
        `${ENDPOINT_BASE}/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: req.prompt }],
            parameters: {
              sampleCount: count,
              aspectRatio: aspectForProvider,
              seed: req.seed,
              negativePrompt: req.negativePrompt,
              outputMimeType: 'image/png',
            },
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ImageGenError(`${res.status} ${text}`, 'gemini');
      }

      type GeminiResp = { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> };
      const json = (await res.json()) as GeminiResp;
      const preds = json.predictions ?? [];
      if (preds.length === 0) throw new ImageGenError('no predictions returned', 'gemini');

      return {
        provider: 'gemini',
        model,
        latencyMs: elapsed(),
        images: preds.map((p) => ({
          url: p.bytesBase64Encoded ? `data:${p.mimeType ?? 'image/png'};base64,${p.bytesBase64Encoded}` : '',
          dataUrl: p.bytesBase64Encoded ? `data:${p.mimeType ?? 'image/png'};base64,${p.bytesBase64Encoded}` : undefined,
          mimeType: p.mimeType ?? 'image/png',
          width: w,
          height: h,
        })),
        raw: json,
      };
    },
  };
}
