import {
  buildCompositionGuidance,
  type CompositionGuidanceInput,
} from './guidance';
import type { ImageGenRequest } from './types';

/**
 * Merge composition guidance into an `ImageGenRequest`. Pure: safe to unit
 * test without mocking providers. Leaves the request untouched when no
 * guidance fires (e.g. `ig-post` preset, no focusArea, no negativeZones).
 *
 * Any incoming `negativePrompt` is preserved and merged with the guidance's
 * tokens — callers keep their own negative prompts without having to know
 * anything about preset-derived ones.
 */
export function applyGuidanceToRequest<T extends ImageGenRequest>(
  base: T,
  guidanceInput: CompositionGuidanceInput
): T {
  const guidance = buildCompositionGuidance(guidanceInput);

  const hasSuffix = guidance.promptSuffix.length > 0;
  const hasNegative = guidance.negativePrompt.length > 0;
  if (!hasSuffix && !hasNegative) return base;

  const prompt = hasSuffix
    ? `${base.prompt.trim()} ${guidance.promptSuffix}`.trim()
    : base.prompt;

  const negativePrompt = hasNegative
    ? base.negativePrompt
      ? `${base.negativePrompt.trim()}, ${guidance.negativePrompt}`
      : guidance.negativePrompt
    : base.negativePrompt;

  return { ...base, prompt, negativePrompt };
}
