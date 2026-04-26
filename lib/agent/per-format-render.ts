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
 * Aspect-specific composition guidance appended to the hero prompt before
 * each per-format call. Tells gpt-image-2 to actually FRAME for the target
 * aspect instead of producing its default 1:1 / 16:9 default and adding
 * letterbox bars to fill the requested canvas. Empirically: the 4:5 and
 * 9:16 outputs went from gray-bar letterboxed to fully filled compositions
 * after this cue was added (2026-04-27).
 *
 * The cue ALSO instructs the model to RECOMPOSE the scene for this aspect
 * — not just re-crop the 1:1 hero. Without this, gpt-image-2 produces
 * three near-identical images at different sizes; we want the same brand
 * subject reframed for each platform's reading habits (close-up for IG
 * feed, full-figure tall for Reels, wide environmental for LinkedIn).
 */
function withAspectComposition(prompt: string, aspect: AspectRatio): string {
  const cue = ASPECT_COMPOSITION_CUE[aspect];
  if (!cue) return prompt;
  // Append the cue AS A NEW LINE so it reads as a constraint, not a
  // continuation of whatever subject sentence the prompt ends on.
  return `${prompt.trim()}\n\n${cue}\n\nRecompose the scene for this aspect — same subject and brand mood, but reframe the composition (subject placement, lens, breathing room) so it reads natively at this canvas size. Do not output the same image at a different crop.`;
}

/**
 * Per-aspect composition cues. Wording follows OpenAI's image-gen prompting
 * guide (developers.openai.com/cookbook/examples/multimodal/
 * image-gen-models-prompting-guide): positive framing + explicit subject
 * placement, no double-negatives like "no letterbox" that can prime the
 * model toward producing the very thing we're trying to avoid. Each cue
 * states the orientation, the platform context (so the model leans on its
 * IG / Reel / LinkedIn priors), and the subject anchor.
 */
const ASPECT_COMPOSITION_CUE: Partial<Record<AspectRatio, string>> = {
  '1:1':
    'Frame this as a 1:1 square Instagram feed photograph. Subject anchored at centre, composition fills the square edge to edge.',
  '4:5':
    'Frame this as a 4:5 vertical portrait Instagram feed photograph. Subject takes the full height of the canvas with the head / focal element anchored in the upper third; composition extends to all four edges of the portrait canvas.',
  '9:16':
    'Frame this as a tall 9:16 vertical Story / Reel photograph for mobile. Subject runs the full height of the tall canvas with generous vertical breathing room above the head / focal element; composition extends to all four edges of the tall vertical canvas.',
  '16:9':
    'Frame this as a wide 16:9 cinematic landscape photograph (LinkedIn / YouTube banner). Subject anchored slightly left of centre, horizontal scene extending to both side edges; composition fills the full wide canvas.',
  '3:4':
    'Frame this as a 3:4 vertical portrait photograph. Subject takes the full height of the canvas; composition extends to all four edges.',
  '4:3':
    'Frame this as a 4:3 horizontal photograph. Subject takes the full width; composition extends to all four edges.',
  '2:3':
    'Frame this as a 2:3 vertical portrait photograph. Subject takes the full height of the canvas; composition extends to all four edges.',
  '3:2':
    'Frame this as a 3:2 horizontal photograph. Subject takes the full width; composition extends to all four edges.',
};

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
      // Inject an aspect-specific composition cue into the prompt so
      // gpt-image-2 actually composes for that aspect instead of
      // generating its default landscape and letterboxing into the
      // requested size. Without this, the 4:5 / 9:16 / 16:9 outputs
      // come back with visible gray bars baked into the image — the
      // user complained about this exact behaviour on 2026-04-27.
      const composedPrompt = withAspectComposition(input.prompt, aspect);
      const out = await provider.generate(
        {
          prompt: composedPrompt,
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
