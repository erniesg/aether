/**
 * EventConfig → RecapVideoData bridge behaviour.
 */
import { describe, expect, it } from 'vitest';
import aieConfig from '../../research/event-recap/fixtures/aie-2026.config';
import { deriveRecapVideoData, distributeNodes, type RecapMetrics } from './derive';

const METRICS: RecapMetrics = {
  rawViewsMillions: 4.05,
  curatedPosts: 872,
  totalPosts: 1847,
  locationDate: 'may 2026 · sg',
};

describe('distributeNodes', () => {
  it('front-loads the remainder', () => {
    expect(distributeNodes(13, 4)).toEqual([4, 3, 3, 3]);
  });

  it('handles an even split', () => {
    expect(distributeNodes(12, 4)).toEqual([3, 3, 3, 3]);
  });

  it('handles fewer nodes than lanes', () => {
    expect(distributeNodes(2, 4)).toEqual([1, 1, 0, 0]);
  });

  it('returns empty for zero lanes', () => {
    expect(distributeNodes(5, 0)).toEqual([]);
  });
});

describe('deriveRecapVideoData', () => {
  it('derives chrome from the config with lowercased name defaults', () => {
    const data = deriveRecapVideoData(aieConfig, METRICS);
    expect(data.event.eventId).toBe(aieConfig.eventId);
    expect(data.event.displayName).toBe(aieConfig.name.toLowerCase());
    expect(data.event.locationDate).toBe('may 2026 · sg');
  });

  it('honours display overrides', () => {
    const data = deriveRecapVideoData(aieConfig, {
      ...METRICS,
      displayName: 'aie · 2026',
      tag: 'aie 2026',
    });
    expect(data.event.displayName).toBe('aie · 2026');
    expect(data.event.tag).toBe('aie 2026');
  });

  it('builds a four-stage funnel from the metrics', () => {
    const data = deriveRecapVideoData(aieConfig, METRICS);
    expect(data.funnel).toHaveLength(4);
    const [raw, curated, synthesised, distilled] = data.funnel!;
    expect(raw).toMatchObject({ value: 4.05, format: 'millions', fill: 1 });
    expect(curated).toMatchObject({ value: 872, format: 'thousands' });
    expect(curated.footerLeft).toBe('872 / 1,847');
    expect(curated.scope).toBe(`~${Math.round((872 / 1847) * 100)}%`);
    expect(synthesised.value).toBe(aieConfig.stories.length);
    expect(distilled.value).toBe(aieConfig.atlasLanes.length);
  });

  it('maps atlas lanes from the config, lowercased, with distributed nodes', () => {
    const data = deriveRecapVideoData(aieConfig, METRICS);
    const lanes = data.atlas!.lanes;
    expect(lanes).toHaveLength(aieConfig.atlasLanes.length);
    expect(lanes.map((l) => l.label)).toEqual(
      aieConfig.atlasLanes.map((l) => l.label.toLowerCase()),
    );
    const total = lanes.reduce((sum, l) => sum + l.nodeCount, 0);
    expect(total).toBe(aieConfig.stories.length);
  });

  it('respects explicit lane node counts and story count', () => {
    const counts = aieConfig.atlasLanes.map((_, i) => i + 1);
    const data = deriveRecapVideoData(aieConfig, {
      ...METRICS,
      storyCount: 99,
      laneNodeCounts: counts,
    });
    expect(data.atlas!.storyCount).toBe(99);
    expect(data.atlas!.lanes.map((l) => l.nodeCount)).toEqual(counts);
  });

  it('omits the mosaic when no tiles are supplied', () => {
    expect(deriveRecapVideoData(aieConfig, METRICS).mosaic).toBeUndefined();
  });

  it('builds the mosaic with sensible defaults when tiles are supplied', () => {
    const data = deriveRecapVideoData(aieConfig, {
      ...METRICS,
      mosaicTiles: [{ label: 'stage' }, { label: 'keynote', highlight: true }],
    });
    expect(data.mosaic).toMatchObject({
      sample: '2',
      stat: '4.05m views',
    });
    expect(data.mosaic!.tiles).toHaveLength(2);
  });
});
