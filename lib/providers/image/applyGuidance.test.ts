import { describe, expect, it } from 'vitest';
import { applyGuidanceToRequest } from './applyGuidance';

const BASE_PROMPT = 'A calm tropical sunset with palm silhouettes';

describe('applyGuidanceToRequest', () => {
  it('returns the base request unchanged when no guidance is provided', () => {
    const out = applyGuidanceToRequest(
      { prompt: BASE_PROMPT, aspectRatio: '1:1' },
      {}
    );
    expect(out.prompt).toBe(BASE_PROMPT);
    expect(out.negativePrompt).toBeUndefined();
    expect(out.aspectRatio).toBe('1:1');
  });

  it('appends the story guidance suffix and sets a negative prompt', () => {
    const out = applyGuidanceToRequest(
      { prompt: BASE_PROMPT, aspectRatio: '9:16' },
      { preset: 'story' }
    );
    expect(out.prompt.startsWith(BASE_PROMPT)).toBe(true);
    expect(out.prompt.toLowerCase()).toContain('top 14%');
    expect(out.prompt.toLowerCase()).toContain('bottom 20%');
    expect(out.negativePrompt).toBeDefined();
    expect(out.negativePrompt!.toLowerCase()).toContain('stickers');
  });

  it('does not overwrite an incoming negativePrompt; it merges', () => {
    const out = applyGuidanceToRequest(
      { prompt: BASE_PROMPT, aspectRatio: '9:16', negativePrompt: 'blur, low quality' },
      { preset: 'story' }
    );
    expect(out.negativePrompt).toContain('blur, low quality');
    expect(out.negativePrompt).toContain('stickers');
  });

  it('is a no-op for ig-post (kind none)', () => {
    const out = applyGuidanceToRequest(
      { prompt: BASE_PROMPT, aspectRatio: '4:5' },
      { preset: 'ig-post' }
    );
    expect(out.prompt).toBe(BASE_PROMPT);
    expect(out.negativePrompt).toBeUndefined();
  });

  it('combines a preset with additional negative zones', () => {
    const out = applyGuidanceToRequest(
      { prompt: BASE_PROMPT, aspectRatio: '9:16' },
      {
        preset: 'story',
        negativeZones: [{ x: 0.1, y: 0.4, w: 0.2, h: 0.1, label: 'partner logo' }],
      }
    );
    expect(out.prompt.toLowerCase()).toContain('partner logo');
    expect(out.prompt.toLowerCase()).toContain('top 14%');
  });
});
