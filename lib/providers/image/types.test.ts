import { describe, it, expectTypeOf } from 'vitest';
import type {
  ImageComposition,
  ImageCompositionTextStrategy,
  ImageConstraintToken,
  ImageGenRequest,
  ImageProviderId,
} from './types';

describe('image provider types · composition', () => {
  it('composition is optional on ImageGenRequest', () => {
    const minimal: ImageGenRequest = { prompt: 'hi' };
    expectTypeOf(minimal.composition).toEqualTypeOf<ImageComposition | undefined>();
  });

  it('ImageCompositionTextStrategy is the exhaustive union {none,baked,auto}', () => {
    expectTypeOf<ImageCompositionTextStrategy>().toEqualTypeOf<'none' | 'baked' | 'auto'>();
  });

  it('ImageConstraintToken enumerates the closed set of tokens', () => {
    expectTypeOf<ImageConstraintToken>().toEqualTypeOf<
      | 'no-faces'
      | 'no-watermarks'
      | 'no-signatures'
      | 'no-unknown-brand-logos'
      | 'no-typography-artifacts'
      | 'no-nsfw-overlay-text'
    >();
  });

  it('ImageComposition fields are optional', () => {
    const empty: ImageComposition = {};
    expectTypeOf(empty.textStrategy).toEqualTypeOf<ImageCompositionTextStrategy | undefined>();
    expectTypeOf(empty.constraints).toEqualTypeOf<ImageConstraintToken[] | undefined>();
  });

  it('ImageProviderId covers the four shipped adapters', () => {
    expectTypeOf<ImageProviderId>().toEqualTypeOf<
      'openai' | 'gemini' | 'replicate' | 'volcengine'
    >();
  });
});
