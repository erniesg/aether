import type {
  ImageEditRequest,
  ImageGenProvider,
  ImageGenRequest,
  ImageGenResult,
} from './types';
import { ImageGenError } from './types';
import { applyComposition } from './composition';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const DEFAULT_MODEL = 'imagen-4.0-generate-001';
const DEFAULT_EDIT_MODEL = 'gemini-2.5-flash-image-preview';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Resolve a source image into inline base64 bytes for generateContent.
 * Accepts a base64 data URL directly; anything else is fetched.
 */
async function sourceToInlineBytes(
  sourceUrl: string
): Promise<{ mimeType: string; data: string }> {
  if (sourceUrl.startsWith('data:')) {
    const commaIdx = sourceUrl.indexOf(',');
    const header = sourceUrl.slice(5, commaIdx);
    if (commaIdx <= 5 || !header.includes(';base64')) {
      throw new ImageGenError('source data URL must be base64-encoded', 'gemini');
    }
    return {
      mimeType: header.split(';', 1)[0] || 'image/png',
      data: sourceUrl.slice(commaIdx + 1),
    };
  }
  const res = await fetchWithTimeout(sourceUrl, {});
  if (!res.ok) {
    throw new ImageGenError(`failed to fetch source image (${res.status})`, 'gemini');
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mimeType, data: buf.toString('base64') };
}

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

      const applied = applyComposition(
        { prompt: req.prompt, negativePrompt: req.negativePrompt },
        req.composition ?? {},
        'gemini'
      );

      const elapsed = mark();
      const res = await fetchWithTimeout(
        `${ENDPOINT_BASE}/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt: applied.prompt }],
            parameters: {
              sampleCount: count,
              aspectRatio: aspectForProvider,
              seed: req.seed,
              negativePrompt: applied.negativePrompt,
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

    /**
     * Instruction-based edit via generateContent (nano-banana class models).
     * No mask channel — `maskUrl` is ignored; the instruction carries the
     * edit intent ("remove the subject and fill the background"). Callers
     * needing strict mask fidelity should route to a mask-capable adapter
     * (replicate flux-fill) via the edit registry.
     */
    async edit(req: ImageEditRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('GOOGLE_GEMINI_API_KEY not set', 'gemini');
      const model = opts.model || DEFAULT_EDIT_MODEL;
      const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);

      const inline = await sourceToInlineBytes(req.sourceUrl);

      const elapsed = mark();
      const res = await fetchWithTimeout(
        `${ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inlineData: { mimeType: inline.mimeType, data: inline.data } },
                  { text: req.prompt },
                ],
              },
            ],
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ImageGenError(`${res.status} ${text}`, 'gemini');
      }

      type GeminiContentResp = {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType?: string; data?: string };
              inline_data?: { mime_type?: string; data?: string };
            }>;
          };
        }>;
      };
      const json = (await res.json()) as GeminiContentResp;
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const images = parts
        .map((part) => {
          const inlineData = part.inlineData ?? {
            mimeType: part.inline_data?.mime_type,
            data: part.inline_data?.data,
          };
          if (!inlineData?.data) return null;
          const mimeType = inlineData.mimeType ?? 'image/png';
          const dataUrl = `data:${mimeType};base64,${inlineData.data}`;
          return { url: dataUrl, dataUrl, mimeType, width: w, height: h };
        })
        .filter((img): img is NonNullable<typeof img> => img !== null);
      if (images.length === 0) {
        throw new ImageGenError('no edited image returned', 'gemini');
      }

      return {
        provider: 'gemini',
        model,
        latencyMs: elapsed(),
        images,
        raw: json,
      };
    },
  };
}
