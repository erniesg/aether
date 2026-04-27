import { describe, expect, it, vi } from 'vitest';
import { renderPerFormatHeroes } from './per-format-render';
import type {
  AspectRatio,
  ImageGenProvider,
  ImageGenResult,
} from '@/lib/providers/image/types';

function makeFakeProvider(
  generate: (req: unknown, opts: unknown) => Promise<ImageGenResult>
): ImageGenProvider {
  return {
    id: 'openai',
    displayName: 'fake',
    isAvailable: () => true,
    listModels: () => ['fake-model'],
    generate: generate as unknown as ImageGenProvider['generate'],
  };
}

describe('renderPerFormatHeroes', () => {
  it('fires one provider call per aspect ratio in PARALLEL', async () => {
    const inFlight: AspectRatio[] = [];
    let maxConcurrent = 0;
    const provider = makeFakeProvider(async (req: any) => {
      inFlight.push(req.aspectRatio);
      maxConcurrent = Math.max(maxConcurrent, inFlight.length);
      // Wait long enough for all three calls to overlap.
      await new Promise((r) => setTimeout(r, 50));
      inFlight.splice(inFlight.indexOf(req.aspectRatio), 1);
      return {
        provider: 'openai',
        model: 'fake-model',
        latencyMs: 50,
        images: [
          {
            url: `https://cdn/${req.aspectRatio}.png`,
            mimeType: 'image/png',
            width: req.aspectRatio === '4:5' ? 1080 : 1080,
            height: req.aspectRatio === '4:5' ? 1350 : 1920,
          },
        ],
      };
    });

    const out = await renderPerFormatHeroes({
      prompt: 'a calm urban park',
      aspectRatios: ['4:5', '9:16', '16:9'],
      provider,
    });

    // All 3 calls observed in flight at the same time → parallel.
    expect(maxConcurrent).toBe(3);
    // Result map populated for every aspect.
    expect(out.byAspect.size).toBe(3);
    expect(out.byAspect.get('4:5')?.url).toBe('https://cdn/4:5.png');
    expect(out.byAspect.get('9:16')?.url).toBe('https://cdn/9:16.png');
    expect(out.byAspect.get('16:9')?.url).toBe('https://cdn/16:9.png');
    expect(out.errorsByAspect.size).toBe(0);
  });

  it('forwards the same prompt + refs to every provider call', async () => {
    const calls: any[] = [];
    const provider = makeFakeProvider(async (req: any) => {
      calls.push(req);
      return {
        provider: 'openai',
        model: 'fake-model',
        latencyMs: 1,
        images: [
          { url: `https://cdn/${req.aspectRatio}.png`, mimeType: 'image/png', width: 1, height: 1 },
        ],
      };
    });
    await renderPerFormatHeroes({
      prompt: 'shared prompt',
      refs: [{ url: 'https://ref.example/a.png' }],
      aspectRatios: ['4:5', '9:16'],
      provider,
    });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      // Prompt is base + an aspect-specific composition cue appended on a
      // new line. The base must always survive intact (it carries the
      // brand / subject), and the cue must mention the cell's aspect so
      // gpt-image-2 frames for it instead of letterboxing.
      expect(call.prompt.startsWith('shared prompt')).toBe(true);
      expect(call.prompt).toMatch(/Frame this as/);
      expect(call.refs).toEqual([{ url: 'https://ref.example/a.png' }]);
      expect(call.n).toBe(1);
    }
    // Each aspect must get its OWN cue (4:5 ≠ 9:16 prompts).
    expect(calls[0].prompt).not.toBe(calls[1].prompt);
    expect(calls[0].prompt).toMatch(/4:5/);
    expect(calls[1].prompt).toMatch(/9:16/);
  });

  it('fail-soft per aspect: one rejection does not abort the others', async () => {
    const provider = makeFakeProvider(async (req: any) => {
      if (req.aspectRatio === '9:16') {
        throw new Error('synthetic provider failure');
      }
      return {
        provider: 'openai',
        model: 'fake-model',
        latencyMs: 1,
        images: [
          { url: `https://cdn/${req.aspectRatio}.png`, mimeType: 'image/png', width: 1, height: 1 },
        ],
      };
    });
    const out = await renderPerFormatHeroes({
      prompt: 'p',
      aspectRatios: ['4:5', '9:16', '16:9'],
      provider,
    });
    expect(out.byAspect.size).toBe(2);
    expect(out.byAspect.has('9:16')).toBe(false);
    expect(out.errorsByAspect.get('9:16')).toContain('synthetic provider failure');
    expect(out.byAspect.get('4:5')).toBeDefined();
    expect(out.byAspect.get('16:9')).toBeDefined();
  });

  it('hero-anchor: prepends the hero ref + flips prompt to "match identity"', async () => {
    // Restoration of Apr-24 magazine-cover behaviour: with heroAnchor set,
    // the per-aspect calls must (1) get the hero as the FIRST ref so
    // gpt-image-2 /edits anchors on it, and (2) receive a "preserve
    // identity, only reframe" cue instead of the legacy "recompose freely"
    // cue. Without this, the model produced 4 different shoots per lap.
    const calls: any[] = [];
    const provider = makeFakeProvider(async (req: any) => {
      calls.push(req);
      return {
        provider: 'openai',
        model: 'fake-model',
        latencyMs: 1,
        images: [
          { url: `https://cdn/${req.aspectRatio}.png`, mimeType: 'image/png', width: 1, height: 1 },
        ],
      };
    });
    await renderPerFormatHeroes({
      prompt: 'editorial cover',
      refs: [{ url: 'https://ref.example/brand.png' }],
      heroAnchor: { url: 'https://convex.example/hero-1x1.png' },
      aspectRatios: ['4:5', '9:16'],
      provider,
    });
    for (const call of calls) {
      // Hero ref FIRST, brand refs after.
      expect(call.refs[0]).toEqual({ url: 'https://convex.example/hero-1x1.png' });
      expect(call.refs[1]).toEqual({ url: 'https://ref.example/brand.png' });
      // Prompt mentions hero anchoring + preserve identity, NOT recompose.
      expect(call.prompt).toMatch(/HERO ANCHORING/);
      expect(call.prompt).toMatch(/PRESERVE/);
      expect(call.prompt).not.toMatch(/Recompose the scene for this aspect/);
    }
  });

  it('hero-anchor disabled (heroAnchorEnabled=false) falls back to legacy recompose cue', async () => {
    const calls: any[] = [];
    const provider = makeFakeProvider(async (req: any) => {
      calls.push(req);
      return {
        provider: 'openai',
        model: 'fake-model',
        latencyMs: 1,
        images: [
          { url: `https://cdn/${req.aspectRatio}.png`, mimeType: 'image/png', width: 1, height: 1 },
        ],
      };
    });
    await renderPerFormatHeroes({
      prompt: 'editorial cover',
      heroAnchor: { url: 'https://convex.example/hero-1x1.png' },
      heroAnchorEnabled: false,
      aspectRatios: ['4:5'],
      provider,
    });
    expect(calls).toHaveLength(1);
    // Hero NOT prepended (anchoring disabled).
    expect(calls[0].refs).toEqual([]);
    // Legacy recompose cue back in play, no hero-anchor lines.
    expect(calls[0].prompt).toMatch(/Recompose the scene for this aspect/);
    expect(calls[0].prompt).not.toMatch(/HERO ANCHORING/);
  });

  it('records total wall time and per-aspect latency', async () => {
    const provider = makeFakeProvider(async (req: any) => {
      await new Promise((r) => setTimeout(r, 30));
      return {
        provider: 'openai',
        model: 'fake-model',
        latencyMs: 30,
        images: [
          { url: `https://cdn/${req.aspectRatio}.png`, mimeType: 'image/png', width: 1, height: 1 },
        ],
      };
    });
    const out = await renderPerFormatHeroes({
      prompt: 'p',
      aspectRatios: ['4:5', '9:16', '16:9'],
      provider,
    });
    // Three 30ms calls in parallel — total should be roughly one call,
    // not 3× one call. Generous upper bound for CI flake.
    expect(out.totalLatencyMs).toBeLessThan(150);
    for (const aspect of ['4:5', '9:16', '16:9'] as const) {
      expect(out.byAspect.get(aspect)?.latencyMs).toBe(30);
    }
  });
});
