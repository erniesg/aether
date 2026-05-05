import type { ImageGenProvider, ImageGenRequest, ImageGenResult } from './types';
import { ImageGenError } from './types';
import { applyComposition } from './composition';
import { dimsFromAspect, fetchWithTimeout, mark } from './util';
import { MAX_REF_BYTES } from '@/lib/refs/limits';
import {
  REPLICATE_DEFAULT_IMAGE_MODEL,
  imageModelOptionsForProvider,
  normalizeImageModelId,
} from './model-catalog';

const ENDPOINT = 'https://api.replicate.com/v1/predictions';
const DEFAULT_MODEL = REPLICATE_DEFAULT_IMAGE_MODEL;
const REPLICATE_PREDICTION_TIMEOUT_MS = 20 * 60_000;

type ReplicateInput = Record<string, unknown>;

function boolEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function refsForReplicate(req: ImageGenRequest, max = 14): string[] {
  return (req.refs ?? [])
    .map((ref) => ref.url)
    .filter(
      (url): url is string =>
        typeof url === 'string' &&
        url.length > 0 &&
        (isBase64DataUrl(url) || isCloudReachableHttpUrl(url))
    )
    .slice(0, max);
}

async function preparedRefsForReplicate(
  req: ImageGenRequest,
  max = 14,
  signal?: AbortSignal
): Promise<string[]> {
  const refs = refsForReplicate(req, max);
  const prepared: string[] = [];
  for (const url of refs) {
    if (isBase64DataUrl(url)) {
      prepared.push(url);
      continue;
    }
    const dataUri = await refUrlToDataUri(url, signal);
    if (dataUri) prepared.push(dataUri);
  }
  return prepared;
}

function isBase64DataUrl(url: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(url);
}

function isCloudReachableHttpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !(
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function promptWithAvoidance(prompt: string, negativePrompt: string | undefined): string {
  if (!negativePrompt?.trim()) return prompt;
  return `${prompt}\n\nAvoid: ${negativePrompt.trim()}.`;
}

function outputMime(outputFormat: 'jpg' | 'png' | 'webp'): string {
  if (outputFormat === 'png') return 'image/png';
  if (outputFormat === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function imageOutputFormat(model: string): 'jpg' | 'png' | 'webp' {
  if (model.startsWith('openai/gpt-image-')) return 'webp';
  if (model === 'bytedance/seedream-5-lite') return 'png';
  if (model.startsWith('google/nano-banana')) return 'jpg';
  return 'webp';
}

async function refUrlToDataUri(url: string, signal?: AbortSignal): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'image/*',
          'User-Agent': 'aether-reference-cache/1.0',
        },
        signal,
      },
      12_000
    );
  } catch (err) {
    console.warn(
      `[replicate] reference skipped; fetch failed for ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
  if (!res.ok) {
    console.warn(`[replicate] reference skipped; HTTP ${res.status} for ${url}`);
    return null;
  }
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!mime.startsWith('image/')) {
    console.warn(`[replicate] reference skipped; not an image (${mime || 'unknown'})`);
    return null;
  }
  const length = Number(res.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_REF_BYTES) {
    console.warn(`[replicate] reference skipped; over ${MAX_REF_BYTES} bytes`);
    return null;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_REF_BYTES) {
    console.warn(`[replicate] reference skipped; over ${MAX_REF_BYTES} bytes`);
    return null;
  }
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function isRecoverableReferenceInputError(text: string): boolean {
  return (
    /input validation/i.test(text) &&
    /(image_input|input_images|input_image|url|forbidden|403|client error)/i.test(text)
  );
}

function aspectOrDefault(aspectRatio: ImageGenRequest['aspectRatio']): string {
  return aspectRatio && aspectRatio !== 'custom' ? aspectRatio : '1:1';
}

function aspectForSeedream(aspectRatio: ImageGenRequest['aspectRatio']): string {
  const requested = aspectOrDefault(aspectRatio);
  if (requested === '4:5') return '3:4';
  return requested;
}

function aspectForGptImage2(aspectRatio: ImageGenRequest['aspectRatio']): string {
  const requested = aspectOrDefault(aspectRatio);
  if (requested === '1:1') return '1:1';
  if (requested === '16:9' || requested === '4:3' || requested === '3:2') return '3:2';
  return '2:3';
}

function buildReplicateInput(
  model: string,
  req: ImageGenRequest,
  applied: { prompt: string; negativePrompt?: string },
  refs: string[]
): { input: ReplicateInput; mimeType: string } {
  const outputFormat = imageOutputFormat(model);
  const prompt = promptWithAvoidance(applied.prompt, applied.negativePrompt);
  const count = Math.max(1, Math.min(req.n ?? 1, 10));

  if (model === 'bytedance/seedream-5-lite') {
    return {
      mimeType: outputMime(outputFormat),
      input: {
        prompt,
        image_input: refs,
        size: '2K',
        aspect_ratio: aspectForSeedream(req.aspectRatio),
        sequential_image_generation: 'disabled',
        max_images: 1,
        output_format: outputFormat,
      },
    };
  }

  if (model === 'google/nano-banana-pro') {
    return {
      mimeType: outputMime(outputFormat),
      input: {
        prompt,
        image_input: refs,
        aspect_ratio: aspectOrDefault(req.aspectRatio),
        resolution: '2K',
        output_format: outputFormat,
        safety_filter_level: 'block_only_high',
        ...(boolEnv(process.env.REPLICATE_NANO_BANANA_PRO_ALLOW_FALLBACK)
          ? { allow_fallback_model: true }
          : {}),
      },
    };
  }

  if (model === 'google/nano-banana-2') {
    return {
      mimeType: outputMime(outputFormat),
      input: {
        prompt,
        image_input: refs,
        aspect_ratio: aspectOrDefault(req.aspectRatio),
        resolution: '2K',
        google_search: false,
        image_search: false,
        output_format: outputFormat,
      },
    };
  }

  if (model === 'google/nano-banana') {
    return {
      mimeType: outputMime(outputFormat),
      input: {
        prompt,
        image_input: refs,
        aspect_ratio: aspectOrDefault(req.aspectRatio),
        output_format: outputFormat,
      },
    };
  }

  if (model.startsWith('openai/gpt-image-')) {
    return {
      mimeType: outputMime(outputFormat),
      input: {
        prompt,
        input_images: refs,
        aspect_ratio: aspectForGptImage2(req.aspectRatio),
        number_of_images: count,
        quality: 'auto',
        background: 'auto',
        output_compression: 90,
        output_format: outputFormat,
        moderation: 'auto',
      },
    };
  }

  const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);
  return {
    mimeType: outputMime(outputFormat),
    input: {
      prompt: applied.prompt,
      aspect_ratio: req.aspectRatio ?? '1:1',
      width: w,
      height: h,
      seed: req.seed,
      negative_prompt: applied.negativePrompt,
      ...(refs[0] ? { input_image: refs[0], input_images: refs } : {}),
    },
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
    listModels: () => imageModelOptionsForProvider('replicate').map((option) => option.value),

    async generate(req: ImageGenRequest, opts): Promise<ImageGenResult> {
      if (!apiKey) throw new ImageGenError('REPLICATE_API_TOKEN not set', 'replicate');
      const model = normalizeImageModelId('replicate', opts.model) || DEFAULT_MODEL;
      const { w, h } = req.size ?? dimsFromAspect(req.aspectRatio);

      const applied = applyComposition(
        { prompt: req.prompt, negativePrompt: req.negativePrompt },
        req.composition ?? {},
        'replicate'
      );

      const elapsed = mark();
      const preparedRefs = await preparedRefsForReplicate(req, 14, opts.signal);
      const { input, mimeType } = buildReplicateInput(model, req, applied, preparedRefs);

      // Start prediction using the model slug endpoint (latest version).
      const createPrediction = (predictionInput: ReplicateInput) =>
        fetchWithTimeout(
          `https://api.replicate.com/v1/models/${model}/predictions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              Prefer: 'wait=60',
            },
            signal: opts.signal,
            body: JSON.stringify({
              input: predictionInput,
            }),
          },
          REPLICATE_PREDICTION_TIMEOUT_MS
        );

      let createRes = await createPrediction(input);

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => createRes.statusText);
        if (preparedRefs.length > 0 && isRecoverableReferenceInputError(text)) {
          console.warn(
            `[replicate] model rejected ${preparedRefs.length} reference(s); retrying without refs`
          );
          const retry = buildReplicateInput(model, req, applied, []);
          createRes = await createPrediction(retry.input);
          if (createRes.ok) {
            // Continue below with the retry response.
          } else {
            const retryText = await createRes.text().catch(() => createRes.statusText);
            throw new ImageGenError(`${createRes.status} ${retryText}`, 'replicate');
          }
        } else {
          throw new ImageGenError(`${createRes.status} ${text}`, 'replicate');
        }
      }

      type RepPrediction = { id: string; status: string; output?: string | string[]; urls?: { get?: string }; error?: string };
      let pred = (await createRes.json()) as RepPrediction;

      // If the Prefer: wait header didn't resolve the prediction synchronously, poll.
      const deadline = Date.now() + REPLICATE_PREDICTION_TIMEOUT_MS;
      while (pred.status !== 'succeeded' && pred.status !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const follow = pred.urls?.get ?? `${ENDPOINT}/${pred.id}`;
        const pollRes = await fetchWithTimeout(
          follow,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: opts.signal,
          },
          REPLICATE_PREDICTION_TIMEOUT_MS
        );
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
          mimeType,
          width: w,
          height: h,
        })),
        raw: pred,
      };
    },
  };
}
