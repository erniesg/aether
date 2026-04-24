import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';
import { ImageGenError } from './types';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';

const ENDPOINT = 'https://api.replicate.com/v1/predictions';
const DEFAULT_MODEL = 'black-forest-labs/flux-1.1-pro';
const SEEDREAM_5_LITE_MODEL = 'bytedance/seedream-5-lite';

function mapSeedreamAspectRatio(aspectRatio: ImageGenRequest['aspectRatio']) {
  switch (aspectRatio) {
    case '1:1':
    case '4:3':
    case '3:4':
    case '16:9':
    case '9:16':
    case '3:2':
    case '2:3':
      return aspectRatio;
    default:
      return 'match_input_image';
  }
}

function buildSeedreamInput(req: ImageGenRequest, w: number, h: number) {
  const imageInput = (req.refs ?? [])
    .map((ref) => ref.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .slice(0, 14);
  const maxImages = Math.min(15, Math.max(1, Math.round(req.n ?? 1)));
  const aspectRatio = req.aspectRatio
    ? mapSeedreamAspectRatio(req.aspectRatio)
    : imageInput.length > 0
    ? 'match_input_image'
    : '1:1';
  return {
    prompt: req.prompt,
    image_input: imageInput,
    size: Math.max(w, h) > 2048 ? '3K' : '2K',
    aspect_ratio: aspectRatio,
    sequential_image_generation: maxImages > 1 ? 'auto' : 'disabled',
    max_images: maxImages,
    output_format: 'png',
  };
}

/**
 * Replicate adapter. Accepts model identifier as <owner>/<name>[:<version>].
 * This is the escape hatch for any model hosted on Replicate (Flux, Ideogram,
 * SDXL, etc.). Polls the prediction to completion.
 */
export function createReplicateProvider(
  apiKey: string | undefined = process.env.REPLICATE_API_TOKEN
): ImageGenProvider {
  return {
    id: 'replicate',
    displayName: 'Replicate',
    isAvailable: () => Boolean(apiKey),
    listModels: () => [
      'black-forest-labs/flux-1.1-pro',
      'black-forest-labs/flux-1.1-pro-ultra',
      SEEDREAM_5_LITE_MODEL,
      'ideogram-ai/ideogram-v3-turbo',
      'stability-ai/stable-diffusion-3.5-large',
    ],

    async generate(req: ImageGenRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('REPLICATE_API_TOKEN not set', 'replicate');
      const model = opts.model || DEFAULT_MODEL;
      const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);

      const elapsed = mark();

      // Start prediction using the model slug endpoint (latest version).
      const createRes = await fetchWithTimeout(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        },
        body: JSON.stringify({
          input:
            model === SEEDREAM_5_LITE_MODEL
              ? buildSeedreamInput(req, w, h)
              : {
                  prompt: req.prompt,
                  aspect_ratio: req.aspectRatio ?? '1:1',
                  width: w,
                  height: h,
                  seed: req.seed,
                  negative_prompt: req.negativePrompt,
                },
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        throw new ImageGenError(`${createRes.status} ${text}`, 'replicate');
      }

      type RepPrediction = { id: string; status: string; output?: string | string[]; urls?: { get?: string }; error?: string };
      let pred = (await createRes.json()) as RepPrediction;

      // If the Prefer: wait header didn't resolve the prediction synchronously, poll.
      const deadline = Date.now() + 90_000;
      while (pred.status !== 'succeeded' && pred.status !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const follow = pred.urls?.get ?? `${ENDPOINT}/${pred.id}`;
        const pollRes = await fetchWithTimeout(follow, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!pollRes.ok) {
          throw new ImageGenError(`poll failed ${pollRes.status}`, 'replicate');
        }
        pred = (await pollRes.json()) as RepPrediction;
      }

      if (pred.status !== 'succeeded') {
        throw new ImageGenError(pred.error ?? `prediction ended as ${pred.status}`, 'replicate');
      }

      const outputs = Array.isArray(pred.output) ? pred.output : pred.output ? [pred.output] : [];
      if (outputs.length === 0) throw new ImageGenError('no output urls', 'replicate');

      return {
        provider: 'replicate',
        model,
        latencyMs: elapsed(),
        images: outputs.map((url) => ({
          url,
          mimeType: model === SEEDREAM_5_LITE_MODEL ? 'image/png' : 'image/webp',
          width: w,
          height: h,
        })),
        raw: pred,
      };
    },
  };
}
