import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT_GAP_PX,
  DEFAULT_LAYOUT_STRATEGY,
  layoutArtboards,
  type ArtboardLayoutStrategy,
} from './artboardLayout';
import { DEFAULT_ARTBOARDS } from './seedArtboards';

describe('layoutArtboards · row strategy', () => {
  it('places all seeds on y=0 with strictly increasing x', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'row');
    expect(placements).toHaveLength(DEFAULT_ARTBOARDS.length);
    for (const p of placements) {
      expect(p.y).toBe(0);
    }
    for (let i = 1; i < placements.length; i++) {
      expect(placements[i].x).toBeGreaterThan(placements[i - 1].x);
    }
  });

  it('separates siblings by at least gap px', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'row');
    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1];
      const gap = placements[i].x - (prev.x + prev.seed.w);
      expect(gap).toBeGreaterThanOrEqual(DEFAULT_LAYOUT_GAP_PX);
    }
  });
});

describe('layoutArtboards · orientation-groups strategy', () => {
  it('buckets IG Post + XHS into the squareish row', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const igPost = placements.find((p) => p.seed.preset === 'ig-post')!;
    const xhs = placements.find((p) => p.seed.preset === 'xhs-post')!;
    expect(igPost.y).toBe(xhs.y);
  });

  it('buckets Story + Reel cover into the tall row', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const story = placements.find((p) => p.seed.preset === 'story')!;
    const reel = placements.find((p) => p.seed.preset === 'reel-cover')!;
    expect(story.y).toBe(reel.y);
  });

  it('buckets LinkedIn + FB feed + X post into the landscape row', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const linkedin = placements.find((p) => p.seed.preset === 'linkedin-landscape')!;
    const fb = placements.find((p) => p.seed.preset === 'fb-feed')!;
    const x = placements.find((p) => p.seed.preset === 'x-post')!;
    expect(linkedin.y).toBe(fb.y);
    expect(fb.y).toBe(x.y);
  });

  it('places the three rows at distinct y coordinates', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const yCoords = new Set(placements.map((p) => p.y));
    expect(yCoords.size).toBe(3);
  });

  it('orders rows: squareish first, then tall, then landscape', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const square = placements.find((p) => p.seed.preset === 'ig-post')!;
    const tall = placements.find((p) => p.seed.preset === 'story')!;
    const landscape = placements.find((p) => p.seed.preset === 'linkedin-landscape')!;
    expect(square.y).toBeLessThan(tall.y);
    expect(tall.y).toBeLessThan(landscape.y);
  });

  it('rows do not overlap vertically (row i bottom <= row i+1 top, minus gap)', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const rowTops = [...new Set(placements.map((p) => p.y))].sort((a, b) => a - b);
    for (let i = 1; i < rowTops.length; i++) {
      const prevTop = rowTops[i - 1];
      const prevRow = placements.filter((p) => p.y === prevTop);
      const prevBottom = Math.max(...prevRow.map((p) => p.y + p.seed.h));
      expect(rowTops[i]).toBeGreaterThanOrEqual(prevBottom);
    }
  });

  it('within a row, frames do not overlap horizontally', () => {
    const placements = layoutArtboards(DEFAULT_ARTBOARDS, 'orientation-groups');
    const rowTops = [...new Set(placements.map((p) => p.y))];
    for (const top of rowTops) {
      const row = placements
        .filter((p) => p.y === top)
        .sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].seed.w);
      }
    }
  });

  it('handles an empty bucket gracefully (no landscape seeds)', () => {
    const placements = layoutArtboards(
      DEFAULT_ARTBOARDS.filter((a) => a.w / a.h <= 1.3),
      'orientation-groups'
    );
    // Only squareish + tall rows should appear.
    const yCoords = new Set(placements.map((p) => p.y));
    expect(yCoords.size).toBe(2);
  });
});

describe('layoutArtboards · default strategy', () => {
  it('defaults to orientation-groups', () => {
    const usingDefault = layoutArtboards(DEFAULT_ARTBOARDS);
    const explicit = layoutArtboards(DEFAULT_ARTBOARDS, DEFAULT_LAYOUT_STRATEGY);
    expect(usingDefault).toEqual(explicit);
    expect(DEFAULT_LAYOUT_STRATEGY).toBe<ArtboardLayoutStrategy>('orientation-groups');
  });
});
