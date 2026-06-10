/**
 * Bridge an `EventConfig` (the research-pipeline parameterization) plus a
 * recap's measured counts into a `RecapVideoData` payload.
 *
 * The config supplies the structural truth that already lives in the codebase
 * — the atlas lanes and the story definitions — while the funnel counts and
 * any curated quotes/photos are recap outputs the caller passes in. Display
 * chrome defaults are derived from the config name but can be overridden, so
 * the same event never has to repeat itself.
 */
import type { EventConfig } from '../../research/event-recap/event-config';
import type {
  RecapLane,
  RecapMosaicTile,
  RecapQuote,
  RecapVideoData,
} from './types';

export interface RecapMetrics {
  /** Total public views, in millions (renders as e.g. `4.05M`). */
  rawViewsMillions: number;
  /** Posts kept after the recency + signal filters. */
  curatedPosts: number;
  /** Posts gathered before filtering (denominator for the curated bar). */
  totalPosts: number;
  /**
   * Number of story clusters. Defaults to `config.stories.length` when the
   * config carries the shipped story set.
   */
  storyCount?: number;
  /**
   * Per-lane node counts for the atlas, lane-aligned with `config.atlasLanes`.
   * When omitted, `storyCount` is distributed front-loaded across the lanes.
   */
  laneNodeCounts?: number[];
  /** Place + time stamp, e.g. `may 2026 · sg`. */
  locationDate?: string;
  /** Spaced display name override, e.g. `aie · 2026`. */
  displayName?: string;
  /** Compact footer tag override, e.g. `aie 2026`. */
  tag?: string;
  /** Curated quotes for the quote-cascade variant. */
  quotes?: RecapQuote[];
  quoteFooter?: string;
  /** Curated mosaic tiles for the photo-mosaic variant. */
  mosaicTiles?: RecapMosaicTile[];
  mosaicSample?: string;
  mosaicStat?: string;
  mosaicCaption?: string;
}

/** Distribute `total` nodes across `laneCount` lanes, front-loaded. */
export function distributeNodes(total: number, laneCount: number): number[] {
  if (laneCount <= 0) return [];
  const base = Math.floor(total / laneCount);
  let remainder = total - base * laneCount;
  const counts = new Array(laneCount).fill(base);
  for (let i = 0; i < laneCount && remainder > 0; i++, remainder--) {
    counts[i] += 1;
  }
  return counts;
}

function laneLabel(label: string): string {
  // Atlas lane labels render uppercase via CSS; store them lowercase like the
  // hand-authored compositions so source diffs stay legible.
  return label.toLowerCase();
}

export function deriveRecapVideoData(config: EventConfig, metrics: RecapMetrics): RecapVideoData {
  const storyCount = metrics.storyCount ?? config.stories.length;
  const laneCount = config.atlasLanes.length;
  const laneNodeCounts =
    metrics.laneNodeCounts ?? distributeNodes(storyCount, laneCount);

  const curatedPct = metrics.totalPosts
    ? Math.round((metrics.curatedPosts / metrics.totalPosts) * 100)
    : 0;

  const displayName = metrics.displayName ?? config.name.toLowerCase();
  const tag = metrics.tag ?? config.name.toLowerCase();
  const locationDate = metrics.locationDate ?? '';

  const lanes: RecapLane[] = config.atlasLanes.map((lane, i) => ({
    label: laneLabel(lane.label),
    nodeCount: laneNodeCounts[i] ?? 0,
  }));

  return {
    event: { eventId: config.eventId, displayName, tag, locationDate },
    funnel: [
      {
        label: 'raw signal',
        value: metrics.rawViewsMillions,
        format: 'millions',
        descriptor: 'views observed across **x, linkedin, youtube**',
        fill: 1,
        scope: '100%',
        footerLeft: locationDate || tag,
        footerRight: 'collection window',
      },
      {
        label: 'curated',
        value: metrics.curatedPosts,
        format: 'thousands',
        descriptor: 'relevant posts after **recency + signal filters**',
        fill: metrics.totalPosts ? metrics.curatedPosts / metrics.totalPosts : 0.5,
        scope: `~${curatedPct}%`,
        footerLeft: `${metrics.curatedPosts.toLocaleString()} / ${metrics.totalPosts.toLocaleString()}`,
        footerRight: 'post-filter',
      },
      {
        label: 'synthesised',
        value: storyCount,
        format: 'integer',
        descriptor: 'story clusters that explain **what the room actually was**',
        fill: 0.25,
        scope: '~25%',
        footerLeft: `${storyCount} clusters`,
        footerRight: 'llm + regex assignment',
      },
      {
        label: 'distilled',
        value: laneCount,
        format: 'integer',
        descriptor: 'lanes that hold **every story we found**',
        fill: 0.1,
        scope: '~10%',
        footerLeft: lanes.map((l) => l.label).join(' · '),
        footerRight: 'output',
      },
    ],
    atlas: {
      lanes,
      storyCount,
      caption: [`${storyCount} stories.`, `${laneCount} lanes.`, 'one event.'],
    },
    quotes: metrics.quotes,
    quoteFooter: metrics.quoteFooter,
    mosaic: metrics.mosaicTiles
      ? {
          sample: metrics.mosaicSample ?? `${metrics.mosaicTiles.length}`,
          tiles: metrics.mosaicTiles,
          caption: metrics.mosaicCaption ?? 'the moment that **travelled**.',
          stat: metrics.mosaicStat ?? `${metrics.rawViewsMillions}m views`,
        }
      : undefined,
  };
}
