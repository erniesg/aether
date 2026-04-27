import { fetchWithTimeout, mark } from '@/lib/providers/image/util';
import type { InpaintProvider, InpaintRequest, InpaintResult } from './types';
import { InpaintError } from './types';

/**
 * LAMA via Replicate — content-aware fill, no text prompt needed. The
 * model takes (image, mask) and returns the source with the mask region
 * filled by surrounding context. Perfect for "remove the subject and
 * patch the hole with what was around it" — the symmetric counterpart
 * to SAM3's cutout output.
 *
 * Default model + version pin can be overridden via INPAINT_MODEL +
 * INPAINT_MODEL_VERSION env so the caller can swap in a newer LAMA
 * fork or a different inpaint model entirely (SDXL inpainting,
 * RealisticVision, etc.) without a code change.
 */

// `cjwbw/lama` was removed from Replicate sometime in 2025 — every
// bg-inpaint call started returning HTTP 422 "Invalid version or not
// permitted". Swapped to lucataco/sdxl-inpainting (verified live
// 2026-04-27): prompt-aware SDXL inpainting that takes the same
// (image, mask) inputs but lets us bias toward "fill the masked
// region with natural photographic background" via the prompt.
//
// True LAMA-style mask-only fill (no prompt-driven content) doesn't
// have a reliably-hosted Replicate version anymore — saik0s/lama
// exists but auto-detects what to remove rather than accepting a mask.
// Override DEFAULT_MODEL / DEFAULT_VERSION via env if a better fork
// surfaces.
const DEFAULT_MODEL = 'lucataco/sdxl-inpainting';
const DEFAULT_VERSION =
  'a5b13068cc81a89a4fbeefeccc774869fcb34df4dbc92c1555e0f2771d49dde7';
const DEFAULT_BG_FILL_PROMPT =
  'natural photographic background, seamless continuation of the surrounding scene, no people, no subjects, no text';
const DEFAULT_NEGATIVE_PROMPT =
  'people, person, human, face, body, text, watermark, lowres, bad anatomy';

type ReplicatePrediction = {
  id: string;
  status: string;
  output?: string | string[];
  urls?: { get?: string };
  error?: string;
};

export function createReplicateInpaintProvider(
  apiKey: string | undefined = process.env.REPLICATE_API_TOKEN,
  modelOverride: string | undefined = process.env.INPAINT_MODEL,
  versionOverride: string | undefined = process.env.INPAINT_MODEL_VERSION
): InpaintProvider {
  const model = modelOverride || DEFAULT_MODEL;
  const version = versionOverride || DEFAULT_VERSION;

  return {
    id: 'replicate-lama',
    displayName: 'LAMA Inpainting via Replicate',
    isAvailable: () => Boolean(apiKey),
    getAvailabilityIssue: () =>
      apiKey ? undefined : 'Replicate inpaint is not connected (set REPLICATE_API_TOKEN)',
    listModels: () => [model],

    async inpaint(req: InpaintRequest, _opts: { model: string }): Promise<InpaintResult> {
      if (!apiKey) {
        throw new InpaintError('REPLICATE_API_TOKEN not set', 'replicate-lama');
      }

      const elapsed = mark();

      const createRes = await fetchWithTimeout(
        'https://api.replicate.com/v1/predictions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // Inline-wait up to 60s; long jobs fall back to polling.
            Prefer: 'wait=60',
          },
          body: JSON.stringify({
            version,
            input: {
              image: req.sourceUrl,
              mask: req.maskUrl,
              // SDXL-inpainting needs a prompt; default to a
              // bg-continuation phrasing so the masked subject region is
              // filled with plausible photographic background, not a new
              // subject. Caller's `req.prompt` wins when supplied.
              prompt: req.prompt || DEFAULT_BG_FILL_PROMPT,
              negative_prompt: DEFAULT_NEGATIVE_PROMPT,
              // strength=1.0 = full destruction of source pixels in the
              // masked region (we WANT the subject area redrawn). Outside
              // the mask, the original image is preserved verbatim.
              strength: 1.0,
              // Lower guidance keeps the fill closer to the surrounding
              // pixels rather than over-interpreting the prompt.
              guidance_scale: 5.0,
              steps: 25,
            },
          }),
        }
      );

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        throw new InpaintError(`${createRes.status} ${text}`, 'replicate-lama');
      }

      let pred = (await createRes.json()) as ReplicatePrediction;
      const deadline = Date.now() + 90_000;

      while (
        pred.status !== 'succeeded' &&
        pred.status !== 'failed' &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const follow =
          pred.urls?.get ?? `https://api.replicate.com/v1/predictions/${pred.id}`;
        const followRes = await fetchWithTimeout(follow, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!followRes.ok) {
          const text = await followRes.text().catch(() => followRes.statusText);
          throw new InpaintError(`${followRes.status} ${text}`, 'replicate-lama');
        }
        pred = (await followRes.json()) as ReplicatePrediction;
      }

      if (pred.status !== 'succeeded') {
        throw new InpaintError(
          pred.error ?? `prediction stuck in status=${pred.status}`,
          'replicate-lama'
        );
      }

      // LAMA on Replicate returns either a single URL string or a 1-element
      // array depending on the model version. Handle both.
      const output = pred.output;
      const imageUrl =
        typeof output === 'string' ? output : Array.isArray(output) ? output[0] : '';
      if (!imageUrl) {
        throw new InpaintError('prediction returned no image url', 'replicate-lama');
      }

      // Best-effort latency telemetry for callers that want it.
      void elapsed();

      return {
        provider: 'replicate-lama',
        model,
        imageUrl,
        width: req.size?.w ?? 0,
        height: req.size?.h ?? 0,
        raw: pred,
      };
    },
  };
}
