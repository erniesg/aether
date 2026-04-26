/**
 * Parallel native-per-format hero render.
 *
 * Bug-4 in HANDOFF-2026-04-26-NIGHT-POWER-THROUGH-POSTING-AND-REVIEW: the
 * lap today fires ONE generate_image call (1:1) and crops the other formats
 * from it; brand subjects can clip when crops are tight. This helper fires
 * the missing aspect ratios as direct provider calls in parallel, so the
 * cost ramp is bounded and wall time stays roughly equal to a single render.
 *
 * Contract:
 *   - Always opt-in. Caller decides whether to invoke based on the
 *     AUTO_MODE_NATIVE_PER_FORMAT flag.
 *   - Provider-agnostic: routes through `resolveProvider()` with the
 *     same precedence rules the agent uses.
 *   - Fail-soft per format: a single rejected provider call doesn't kill
 *     the others; the result map's missing entries let the caller fall
 *     back to crop-from-1:1 for that format.
 *
 * Wired by `lib/agent/auto-mode.ts:runOneVariation` after the agent's
 * 1:1 hero is extracted from agentSteps.
 */

import { resolveProvider } from '@/lib/providers/image/registry';
import type {
  AspectRatio,
  ImageGenProvider,
  ImageRef,
} from '@/lib/providers/image/types';

export interface PerFormatRenderInput {
  /** The same prompt the agent used for the 1:1 hero. Recovered from
   *  the agent's generate_image tool step input. */
  prompt: string;
  /** Reference images forwarded to the provider as `refs[]`. */
  refs?: ImageRef[];
  /** Aspect ratios to render natively (typically the non-1:1 formats). */
  aspectRatios: AspectRatio[];
  /** Override for tests — defaults to registry's chosen provider. */
  provider?: ImageGenProvider;
  /** Provider model id; falls back to the provider's first listed model. */
  model?: string;
}

export interface PerFormatRenderResult {
  /** Map of aspect ratio → provider result. Missing entries indicate the
   *  call rejected (logged) and the caller should fall back. */
  byAspect: Map<
    AspectRatio,
    {
      url: string;
      dataUrl?: string;
      width: number;
      height: number;
      latencyMs: number;
    }
  >;
  /** Total wall time including the slowest provider call. */
  totalLatencyMs: number;
  /** Errors keyed by aspect for caller visibility. */
  errorsByAspect: Map<AspectRatio, string>;
}

/**
 * Fire one provider.generate per requested aspect ratio, in parallel.
 * Returns a result map keyed by aspect; failures land in errorsByAspect
 * so the caller can decide to fall back per format rather than abort
 * the whole variation.
 */
export async function renderPerFormatHeroes(
  input: PerFormatRenderInput
): Promise<PerFormatRenderResult> {
  const provider = input.provider ?? resolveProvider();
  const model = input.model ?? provider.listModels()[0];
  const refs = input.refs ?? [];

  const t0 = Date.now();
  const settled = await Promise.allSettled(
    input.aspectRatios.map(async (aspect) => {
      const out = await provider.generate(
        {
          prompt: input.prompt,
          aspectRatio: aspect,
          refs,
          n: 1,
        },
        { model }
      );
      const first = out.images[0];
      if (!first) {
        throw new Error(`provider returned no images for aspect=${aspect}`);
      }
      return {
        aspect,
        url: first.url,
        dataUrl: first.dataUrl,
        width: first.width,
        height: first.height,
        latencyMs: out.latencyMs,
      };
    })
  );
  const totalLatencyMs = Date.now() - t0;

  const byAspect = new Map<
    AspectRatio,
    {
      url: string;
      dataUrl?: string;
      width: number;
      height: number;
      latencyMs: number;
    }
  >();
  const errorsByAspect = new Map<AspectRatio, string>();

  settled.forEach((res, idx) => {
    const aspect = input.aspectRatios[idx];
    if (res.status === 'fulfilled') {
      byAspect.set(res.value.aspect, {
        url: res.value.url,
        dataUrl: res.value.dataUrl,
        width: res.value.width,
        height: res.value.height,
        latencyMs: res.value.latencyMs,
      });
    } else {
      errorsByAspect.set(
        aspect,
        res.reason instanceof Error ? res.reason.message : String(res.reason)
      );
    }
  });

  return { byAspect, totalLatencyMs, errorsByAspect };
}
