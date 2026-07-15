/**
 * Red/green spec for the recap-illustration planner.
 *
 * `buildRecapIllustrationPlan` is pure and deterministic: given an
 * event-recap bundle (facts only) it emits per-platform illustration
 * specs — a fact-grounded image-gen prompt, style directives, format
 * fan-out matching the STANDARD_FORMATS dims, text-safe zones, and a
 * caption seed. The core guarantee under test: nothing in the prompt is
 * invented — every number in the prompt exists in the input bundle.
 */

import { describe, expect, it } from 'vitest';
import { cropHeroToFormats } from '@/lib/canvas/cropToFormat';
import {
  buildRecapIllustrationPlan,
  toRecapIllustrationBundle,
  type IllustrationSpec,
  type RecapIllustrationBundle,
} from './plan';

const bundle: RecapIllustrationBundle = {
  eventId: 'demo-event',
  eventName: 'Demo Builder Summit',
  stats: {
    totalPosts: 1331,
    postsByPlatform: { x: 553, linkedin: 754 },
    knownViews: 4679086,
    knownLikes: 27425,
  },
  themes: [
    { label: 'Hallway dispatches', summary: 'Recaps captured the texture of the event.' },
    { label: 'Builder keynote', summary: 'A minister walked through his own agent stack.' },
    { label: 'Student gratitude', summary: 'Students thanked organizers for the ticket support.' },
  ],
  quotes: [
    { text: 'The best builder room I have ever been in', attribution: 'An attendee on X' },
  ],
};

/** Every maximal digit-run present anywhere in the input bundle. */
function allowedNumberRuns(b: RecapIllustrationBundle): Set<string> {
  const runs = new Set<string>();
  const addFrom = (s: string) => {
    for (const m of s.matchAll(/\d+/g)) runs.add(m[0]);
  };
  addFrom(b.eventId);
  addFrom(b.eventName);
  const stats = b.stats ?? {};
  for (const v of [stats.totalPosts, stats.knownViews, stats.knownLikes]) {
    if (typeof v === 'number') addFrom(String(v));
  }
  for (const v of Object.values(stats.postsByPlatform ?? {})) {
    if (typeof v === 'number') addFrom(String(v));
  }
  for (const t of b.themes ?? []) {
    addFrom(t.label);
    if (t.summary) addFrom(t.summary);
  }
  for (const q of b.quotes ?? []) {
    addFrom(q.text);
    if (q.attribution) addFrom(q.attribution);
  }
  return runs;
}

function specFor(specs: IllustrationSpec[], platform: string): IllustrationSpec {
  const spec = specs.find((s) => s.platform === platform);
  if (!spec) throw new Error(`no spec for platform ${platform}`);
  return spec;
}

describe('buildRecapIllustrationPlan — platform fan-out', () => {
  it('emits one spec per platform, defaulting to x + linkedin + instagram', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    expect(specs.map((s) => s.platform)).toEqual(['x', 'linkedin', 'instagram']);
  });

  it('honours the platforms option as a filter', () => {
    const specs = buildRecapIllustrationPlan(bundle, { platforms: ['x'] });
    expect(specs).toHaveLength(1);
    expect(specs[0].platform).toBe('x');
  });

  it('gives each platform its format targets with STANDARD_FORMATS dims', () => {
    const specs = buildRecapIllustrationPlan(bundle);

    const x = specFor(specs, 'x');
    expect(x.formats.map((f) => f.id)).toEqual(['16x9', '1x1']);

    const li = specFor(specs, 'linkedin');
    expect(li.formats.map((f) => f.id)).toEqual(['16x9', '1x1']);

    const ig = specFor(specs, 'instagram');
    expect(ig.formats.map((f) => f.id)).toEqual(['1x1', '4x5', '9x16']);

    // Cross-check against the dims used by lib/agent/auto-mode.ts
    // STANDARD_FORMATS so hero→format crops stay interchangeable.
    const dims = new Map(
      specs.flatMap((s) => s.formats).map((f) => [f.id, [f.w, f.h] as const])
    );
    expect(dims.get('1x1')).toEqual([1024, 1024]);
    expect(dims.get('4x5')).toEqual([1080, 1350]);
    expect(dims.get('9x16')).toEqual([1080, 1920]);
    expect(dims.get('16x9')).toEqual([1920, 1080]);
  });

  it('marks the first format as the hero and derives the hero aspect from it', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      expect(spec.heroFormat).toEqual(spec.formats[0]);
    }
    expect(specFor(specs, 'x').heroAspect).toBe('16:9');
    expect(specFor(specs, 'linkedin').heroAspect).toBe('16:9');
    expect(specFor(specs, 'instagram').heroAspect).toBe('1:1');
  });
});

describe('buildRecapIllustrationPlan — fact grounding', () => {
  it('puts the event name and a real stat into every prompt', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      expect(spec.prompt).toContain('Demo Builder Summit');
      expect(spec.prompt).toContain('1331');
    }
  });

  it('never invents numbers — every digit-run in prompt and caption exists in the input', () => {
    const allowed = allowedNumberRuns(bundle);
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      for (const text of [spec.prompt, spec.captionSeed]) {
        for (const m of text.matchAll(/\d+/g)) {
          expect(allowed, `unexpected number "${m[0]}" in ${spec.platform}`).toContain(m[0]);
        }
      }
    }
  });

  it('omits stat callouts entirely when the bundle carries no stats', () => {
    const bare: RecapIllustrationBundle = {
      eventId: 'bare',
      eventName: 'Bare Event',
      themes: [{ label: 'Only theme' }],
    };
    const specs = buildRecapIllustrationPlan(bare);
    for (const spec of specs) {
      expect(spec.prompt.match(/\d+/g)).toBeNull();
    }
  });

  it('carries the standout quote with attribution when provided', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    const x = specFor(specs, 'x');
    expect(x.prompt).toContain('The best builder room I have ever been in');
    expect(x.prompt).toContain('An attendee on X');
  });
});

describe('buildRecapIllustrationPlan — style directives', () => {
  it('defaults to doodle-sketchnote with hand-drawn ink directives', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      expect(spec.style).toBe('doodle-sketchnote');
      expect(spec.prompt).toMatch(/hand-drawn/i);
      expect(spec.prompt).toMatch(/sketchnote/i);
      expect(spec.prompt).toMatch(/paper/i);
      expect(spec.prompt).toMatch(/vermillion/i);
    }
  });

  it('switches to editorial-flat directives on request', () => {
    const specs = buildRecapIllustrationPlan(bundle, { style: 'editorial-flat' });
    for (const spec of specs) {
      expect(spec.style).toBe('editorial-flat');
      expect(spec.prompt).toMatch(/flat editorial/i);
      expect(spec.prompt).not.toMatch(/sketchnote/i);
    }
  });

  it('keeps the paper/ink/vermillion palette out of the prompt but on the spec', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      expect(spec.palette).toEqual({
        paper: '#f4ede0',
        ink: '#1a1a1a',
        accent: '#c8413a',
      });
      // Hex codes carry digits; the no-invented-numbers guarantee means
      // they must live on the spec, never inside the prompt text.
      expect(spec.prompt).not.toContain('#');
    }
  });
});

describe('buildRecapIllustrationPlan — safe zones and crop compatibility', () => {
  it('reserves headline and caption text-safe zones that survive all crops', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      const purposes = spec.safeZones.map((z) => z.purpose);
      expect(purposes).toContain('headline');
      expect(purposes).toContain('caption');
      for (const zone of spec.safeZones) {
        expect(zone.mustSurviveAllCrops).toBe(true);
        expect(zone.bbox.x).toBeGreaterThanOrEqual(0);
        expect(zone.bbox.y).toBeGreaterThanOrEqual(0);
        expect(zone.bbox.x + zone.bbox.w).toBeLessThanOrEqual(1);
        expect(zone.bbox.y + zone.bbox.h).toBeLessThanOrEqual(1);
      }
    }
  });

  it('feeds cropHeroToFormats directly — one hero fans out to every format', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    for (const spec of specs) {
      const crops = cropHeroToFormats({
        heroAsset: { width: spec.heroFormat.w, height: spec.heroFormat.h },
        formats: spec.formats,
        safeZones: spec.safeZones,
      });
      expect(crops).toHaveLength(spec.formats.length);
      for (const crop of crops) {
        expect(['fitted', 'partial', 'centered-fallback']).toContain(crop.fit);
      }
    }
  });
});

describe('buildRecapIllustrationPlan — captions and determinism', () => {
  it('seeds each caption from a theme label', () => {
    const specs = buildRecapIllustrationPlan(bundle);
    const labels = (bundle.themes ?? []).map((t) => t.label);
    for (const spec of specs) {
      expect(labels.some((label) => spec.captionSeed.includes(label))).toBe(true);
    }
  });

  it('is deterministic — identical input yields identical output', () => {
    const a = buildRecapIllustrationPlan(bundle);
    const b = buildRecapIllustrationPlan(bundle);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('toRecapIllustrationBundle — public.json extraction', () => {
  it('maps the public bundle shape into planner facts', () => {
    const raw = {
      eventId: 'ai-engineer-singapore',
      eventName: 'AI Engineer Singapore',
      stats: {
        total: 1500,
        relevantTotal: 1331,
        byPlatform: { x: 600, linkedin: 800, youtube: 100 },
        relevantByPlatform: { x: 553, linkedin: 754, youtube: 24 },
        crossSurfaceObserved: { knownViews: 4679086, knownLikes: 27425 },
      },
      themes: [
        { label: 'Low score', summary: 'B', score: 10 },
        { label: 'High score', summary: 'A', score: 900 },
      ],
      posts: [
        {
          text: 'Great crowd energy all day',
          authorName: 'Ada Tan',
          platform: 'x',
          reachScore: 42,
          rowType: 'parent',
        },
      ],
    };
    const mapped = toRecapIllustrationBundle(raw);
    expect(mapped.eventId).toBe('ai-engineer-singapore');
    expect(mapped.eventName).toBe('AI Engineer Singapore');
    // relevant counts win over raw totals when both are present
    expect(mapped.stats?.totalPosts).toBe(1331);
    expect(mapped.stats?.postsByPlatform).toEqual({ x: 553, linkedin: 754, youtube: 24 });
    expect(mapped.stats?.knownViews).toBe(4679086);
    expect(mapped.stats?.knownLikes).toBe(27425);
    // themes come back ordered by score, strongest first
    expect(mapped.themes?.map((t) => t.label)).toEqual(['High score', 'Low score']);
    // a short high-reach parent post becomes the standout quote
    expect(mapped.quotes?.[0]).toEqual({
      text: 'Great crowd energy all day',
      attribution: 'Ada Tan',
    });
  });

  it('strips URLs out of the standout quote text', () => {
    const raw = {
      eventId: 'e',
      eventName: 'E',
      posts: [
        {
          text: 'Rap battle at the booth! https://t.co/abc123xy',
          authorName: 'Clem',
          reachScore: 9,
          rowType: 'parent',
        },
      ],
    };
    const mapped = toRecapIllustrationBundle(raw);
    expect(mapped.quotes?.[0]?.text).toBe('Rap battle at the booth!');
  });

  it('throws on a bundle missing its event identity', () => {
    expect(() => toRecapIllustrationBundle({ stats: {} })).toThrow(/eventId|eventName/);
  });
});
