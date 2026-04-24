import type {
  ImageEditRequest,
  ImageGenProvider,
  ImageGenRequest,
  ImageGenResult,
} from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const DEFAULT_MODEL = 'imagen-4.0-generate-001';
const DEFAULT_EDIT_MODEL = 'gemini-2.5-flash-image-preview';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Parse a data: URL into its MIME type and raw base64 payload. */
function parseDataUrl(url: string): { mimeType: string; base64: string } | null {
  if (!url.startsWith('data:')) return null;
  const comma = url.indexOf(',');
  if (comma < 6) return null;
  const header = url.slice(5, comma);
  if (!header.includes(';base64')) return null;
  const mimeType = header.split(';', 1)[0] || 'image/png';
  return { mimeType, base64: url.slice(comma + 1) };
}

/** Fetch an http(s) image and convert to base64 with its MIME type. */
async function resolveInlineImage(url: string): Promise<{ mimeType: string; base64: string }> {
  const data = parseDataUrl(url);
  if (data) return data;
  if (!/^https?:\/\//i.test(url)) {
    throw new ImageGenError('sourceUrl must be http(s) or data:image/* base64', 'gemini');
  }
  const res = await fetch(url);
  if (!res.ok) throw new ImageGenError(`failed to fetch sourceUrl (${res.status})`, 'gemini');
  const mimeType = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mimeType, base64: buf.toString('base64') };
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

    /**
     * Image-to-image edit via `gemini-2.5-flash-image-preview`. Uses the
     * `:generateContent` endpoint rather than `:predict` (Imagen). A mask
     * field isn't part of the contract for this model — guidance comes via
     * the prompt. We pass `maskUrl` on the contract for parity but warn and
     * ignore it.
     */
    async edit(req: ImageEditRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('GOOGLE_GEMINI_API_KEY not set', 'gemini');
      if (!req.sourceUrl) throw new ImageGenError('sourceUrl is required for edit', 'gemini');
      const model = opts.model || DEFAULT_EDIT_MODEL;
      if (!model.includes('flash-image')) {
        throw new ImageGenError(
          `model ${model} does not support image-to-image; use gemini-2.5-flash-image-preview`,
          'gemini'
        );
      }
      if (req.maskUrl) {
        // eslint-disable-next-line no-console
        console.warn(
          '[gemini] flash-image does not accept a first-class maskUrl; edit is prompt-guided'
        );
      }

      const inline = await resolveInlineImage(req.sourceUrl);

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
                  { text: req.prompt },
                  { inlineData: { mimeType: inline.mimeType, data: inline.base64 } },
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

      type GResp = {
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
        }>;
      };
      const json = (await res.json()) as GResp;
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const outPart = parts.find((p) => p.inlineData?.data)?.inlineData;
      if (!outPart?.data) throw new ImageGenError('no image in response', 'gemini');
      const mimeType = outPart.mimeType ?? 'image/png';

      // flash-image-preview typically returns 1024×1024; we don't probe the
      // PNG here. Callers that care can decode dataUrl to read actual dims.
      const { w: reqW, h: reqH } = req.size ?? dimsFromAspect(req.aspectRatio);

      return {
        provider: 'gemini',
        model,
        latencyMs: elapsed(),
        images: [
          {
            url: `data:${mimeType};base64,${outPart.data}`,
            dataUrl: `data:${mimeType};base64,${outPart.data}`,
            mimeType,
            width: reqW,
            height: reqH,
          },
        ],
        raw: json,
      };
    },
  };
}
