import type { ImageComposition, ImageProviderId } from './types';
import { mapComposition as mapOpenAI } from './composition-openai';
import { mapComposition as mapGemini } from './composition-gemini';
import { mapComposition as mapReplicate } from './composition-replicate';
import { mapComposition as mapVolcengine } from './composition-volcengine';

/**
 * System default policy. Workspaces that never set `brandPolicy` get this; it
 * is the *minimum* bar that keeps text-overlay umbrella assumptions holding.
 */
export const SYSTEM_DEFAULT_COMPOSITION: ImageComposition = {
  textStrategy: 'none',
  constraints: ['no-signatures', 'no-watermarks'],
};

/** Output of `applyComposition` — adapter-shape-agnostic. */
export interface AppliedComposition {
  prompt: string;
  negativePrompt?: string;
  extraParams?: Record<string, unknown>;
}

/**
 * Fold an `ImageComposition` into a base `{ prompt, negativePrompt }` pair,
 * dispatching to the correct adapter mapping. Adapters call this during the
 * prepare step of `generate()`.
 *
 * `textStrategy: 'auto'` is a passthrough — no prompt rewriting, no negative
 * tokens — so creators can explicitly opt out of the constraints without
 * clearing them. `textStrategy: 'baked'` is equivalent here (we still honor
 * explicit constraint tokens, but do not inject text-suppression phrases).
 */
export function applyComposition(
  base: { prompt: string; negativePrompt?: string },
  composition: ImageComposition,
  adapterId: ImageProviderId
): AppliedComposition {
  switch (adapterId) {
    case 'openai': {
      const mapped = mapOpenAI(composition);
      const prompt = mapped.promptSuffix
        ? `${base.prompt}\n\n${mapped.promptSuffix}`
        : base.prompt;
      return {
        prompt,
        negativePrompt: base.negativePrompt,
      };
    }
    case 'gemini': {
      const mapped = mapGemini(composition);
      const prompt = mapped.promptPrefix
        ? `${mapped.promptPrefix} ${base.prompt}`
        : base.prompt;
      const negativePrompt = joinNegative(base.negativePrompt, mapped.negativeTokens);
      return {
        prompt,
        negativePrompt,
      };
    }
    case 'replicate': {
      const mapped = mapReplicate(composition);
      const negativePrompt = joinNegative(base.negativePrompt, mapped.negativeTokens);
      return {
        prompt: base.prompt,
        negativePrompt,
      };
    }
    case 'volcengine': {
      const mapped = mapVolcengine(composition);
      const negativePrompt = joinNegative(
        base.negativePrompt,
        mapped.negativePrompt ? [mapped.negativePrompt] : undefined
      );
      return {
        prompt: base.prompt,
        negativePrompt,
        extraParams: mapped.negativePrompt
          ? { negative_prompt: mapped.negativePrompt }
          : undefined,
      };
    }
  }
}

function joinNegative(existing: string | undefined, additions?: string[]): string | undefined {
  if (!additions || additions.length === 0) return existing;
  const parts: string[] = [];
  if (existing && existing.trim().length > 0) parts.push(existing.trim());
  parts.push(...additions);
  return parts.join(', ');
}

/**
 * Merge a per-call composition over a workspace default over the system
 * default. Shallow: `textStrategy` and `constraints` are resolved
 * independently, so a per-call `{ constraints: [] }` explicitly clears the
 * inherited list without also clobbering `textStrategy`.
 */
export function resolveComposition(
  perCall: ImageComposition | undefined,
  workspace: ImageComposition | undefined
): ImageComposition {
  const out: ImageComposition = { ...SYSTEM_DEFAULT_COMPOSITION };
  if (workspace) {
    if (workspace.textStrategy !== undefined) out.textStrategy = workspace.textStrategy;
    if (workspace.constraints !== undefined) out.constraints = [...workspace.constraints];
  }
  if (perCall) {
    if (perCall.textStrategy !== undefined) out.textStrategy = perCall.textStrategy;
    if (perCall.constraints !== undefined) out.constraints = [...perCall.constraints];
  }
  return out;
}
