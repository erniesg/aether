import type { ImageComposition, ImageConstraintToken } from './types';

/**
 * Imagen's `parameters.negativePrompt` accepts short comma-delimited phrases.
 * We also nudge the main prompt with a leading directive because Imagen's
 * text-suppression is more reliable when both knobs align.
 */
const TOKEN_NEGATIVES: Partial<Record<ImageConstraintToken, string>> = {
  'no-signatures': 'signature',
  'no-watermarks': 'watermark',
  'no-unknown-brand-logos': 'brand logo',
  'no-typography-artifacts': 'typographic artifacts',
  'no-nsfw-overlay-text': 'overlay text',
};

export interface GeminiAdapterComposition {
  /** Phrases to append to the adapter's `negativePrompt` parameter. */
  negativeTokens?: string[];
  /** Optional leading directive on the main prompt. */
  promptPrefix?: string;
}

export function mapComposition(composition: ImageComposition): GeminiAdapterComposition {
  const negatives: string[] = [];
  let promptPrefix: string | undefined;
  if (composition.textStrategy === 'none') {
    negatives.push('text', 'typography', 'lettering', 'captions');
    promptPrefix = 'No text, no typography.';
  }
  for (const token of composition.constraints ?? []) {
    const neg = TOKEN_NEGATIVES[token];
    if (neg) {
      negatives.push(neg);
    } else {
      console.warn(`composition token ${token} not yet mapped for adapter gemini`);
    }
  }
  if (negatives.length === 0 && !promptPrefix) return {};
  return {
    negativeTokens: negatives.length > 0 ? negatives : undefined,
    promptPrefix,
  };
}
