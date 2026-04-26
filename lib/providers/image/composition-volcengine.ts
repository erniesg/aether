import type { ImageComposition, ImageConstraintToken } from './types';

/**
 * Seedream exposes a native `negative_prompt` on the `/images/generations`
 * body — we collect phrases and hand them off as a single Chinese-punctuation
 * or comma-delimited string (Seedream accepts either).
 */
const TOKEN_NEGATIVES: Partial<Record<ImageConstraintToken, string>> = {
  'no-signatures': 'signature, 签名',
  'no-watermarks': 'watermark, 水印',
  'no-unknown-brand-logos': 'brand logo, 品牌标志',
  'no-typography-artifacts': 'typographic artifacts, 字体伪影',
  'no-nsfw-overlay-text': 'overlay text',
};

export interface VolcengineAdapterComposition {
  /**
   * Raw `negative_prompt` string suitable for Seedream's request body.
   * Undefined when no constraints apply.
   */
  negativePrompt?: string;
}

export function mapComposition(composition: ImageComposition): VolcengineAdapterComposition {
  const phrases: string[] = [];
  if (composition.textStrategy === 'none') {
    phrases.push('text', 'typography', 'lettering', '文字', '字幕');
  }
  for (const token of composition.constraints ?? []) {
    const neg = TOKEN_NEGATIVES[token];
    if (neg) {
      phrases.push(neg);
    } else {
      console.warn(`composition token ${token} not yet mapped for adapter volcengine`);
    }
  }
  if (phrases.length === 0) return {};
  return { negativePrompt: phrases.join(', ') };
}
