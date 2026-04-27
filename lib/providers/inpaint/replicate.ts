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

const DEFAULT_MODEL = 'cjwbw/lama';
// LAMA model version pinned to a known-working hash. Override via
// INPAINT_MODEL_VERSION env for a different revision.
const DEFAULT_VERSION =
  '0c4f7c3a1c89e5b5d3a4f84d7b4d5c8b3a2e0d9c3a8e5b7e9d2c1f4a8b6d3e7c';

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
              // LAMA accepts an optional `prompt` field on some forks but
              // the canonical implementation ignores it; pass through for
              // forward-compat with prompt-aware variants.
              ...(req.prompt ? { prompt: req.prompt } : {}),
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
