import type { ImageComposition, ImageConstraintToken } from './types';

/**
 * Most text-to-image models on Replicate (Flux, SDXL, Ideogram) accept a
 * `negative_prompt` field; we compose a comma-delimited list and let the
 * adapter's own JSON body forward it.
 */
const TOKEN_NEGATIVES: Partial<Record<ImageConstraintToken, string>> = {
  'no-signatures': 'signature',
  'no-watermarks': 'watermark',
  'no-unknown-brand-logos': 'brand logo',
  'no-typography-artifacts': 'typographic artifacts',
  'no-nsfw-overlay-text': 'overlay text',
};

export interface ReplicateAdapterComposition {
  negativeTokens?: string[];
}

export function mapComposition(composition: ImageComposition): ReplicateAdapterComposition {
  const negatives: string[] = [];
  if (composition.textStrategy === 'none') {
    negatives.push('text', 'typography', 'lettering', 'captions');
  }
  for (const token of composition.constraints ?? []) {
    const neg = TOKEN_NEGATIVES[token];
    if (neg) {
      negatives.push(neg);
    } else {
      console.warn(`composition token ${token} not yet mapped for adapter replicate`);
    }
  }
  if (negatives.length === 0) return {};
  return { negativeTokens: negatives };
}
