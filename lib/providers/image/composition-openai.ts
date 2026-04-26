import type { ImageComposition, ImageConstraintToken } from './types';

/**
 * OpenAI `/v1/images/generations` has no dedicated negative-prompt field; we
 * fold everything into a natural-language clause appended to `prompt`. Keep
 * the phrasing declarative and first-person — gpt-image models respond well
 * to terse "avoid X" constructions.
 */
const TOKEN_PHRASES: Partial<Record<ImageConstraintToken, string>> = {
  'no-signatures': 'no signatures',
  'no-watermarks': 'no watermarks',
  'no-unknown-brand-logos': 'no unknown brand logos',
  'no-typography-artifacts': 'no typographic artifacts',
  'no-nsfw-overlay-text': 'no NSFW overlay text',
};

export interface OpenAIAdapterComposition {
  /** Clause to append to `prompt` (e.g. "Composition constraints: ..."). */
  promptSuffix?: string;
}

export function mapComposition(composition: ImageComposition): OpenAIAdapterComposition {
  const phrases: string[] = [];
  if (composition.textStrategy === 'none') {
    phrases.push('no text', 'no typography', 'no lettering', 'pure imagery only');
  }
  for (const token of composition.constraints ?? []) {
    const phrase = TOKEN_PHRASES[token];
    if (phrase) {
      phrases.push(phrase);
    } else {
      console.warn(`composition token ${token} not yet mapped for adapter openai`);
    }
  }
  if (phrases.length === 0) return {};
  return { promptSuffix: `Composition constraints: ${phrases.join(', ')}.` };
}
