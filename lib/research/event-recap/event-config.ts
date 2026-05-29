/**
 * Per-event configuration that drives the recap pipeline.
 *
 * Lifts what used to be module-level AIE-specific constants out of
 * story-assignment.ts / expand.ts / relevance.ts / finalize-analysis.ts /
 * workers/aie2026-vibes.ts into a single typed config keyed by eventId.
 *
 * Subsequent slices migrate each consumer:
 *  - slice 2: stories + primaryStoryOverrides + smallStoryMergeTargets
 *  - slice 3: corpusPhraseRules + singleTokenEntityAllowlist
 *  - slice 4: curatedThemeCopy + incidentalMentionPatterns
 *  - slice 5: atlasLanes
 *  - slice 6: recapMode + juncture state
 *
 * The playbook at docs/playbooks/event-recap/ explains the workflow this
 * config drives. Each field maps to a step in that loop.
 */

import type { EventPostStoryType } from './types';

export interface StoryDefinitionConfig {
  storyId: string;
  label: string;
  summary: string;
  keywords: string[];
  signals: Array<{ pattern: RegExp; weight: number }>;
  /**
   * Default story type for posts assigned to this story. Broad-recap and
   * reply detection can still override this per post.
   */
  storyType?: EventPostStoryType;
}

export interface AtlasLaneConfig {
  id: string;
  label: string;
  /**
   * Horizontal position (0-1) of this lane's column center in the atlas
   * layout. Lower x = left side, higher = right.
   */
  x: number;
  /**
   * Themes whose label, summary, or keyword text match this regex are
   * assigned to this lane. The atlas layout checks label first (strict),
   * then full text (broad) before falling through to the next lane. A lane
   * without a matcher acts as the catch-all fallback.
   */
  matcher?: RegExp;
}

export interface PrimaryStoryOverride {
  pattern: RegExp;
  storyId: string;
  /**
   * Optional sub-rule: if the override pattern matches AND the sub-pattern
   * matches, route to subStoryId instead. Mirrors the codex-vs-sponsor
   * branch in the AIE 2026 primaryStoryOverride function.
   */
  subPattern?: RegExp;
  subStoryId?: string;
}

export interface IncidentalMentionConfig {
  /**
   * Patterns that match exact event mentions (e.g. "ai engineer singapore",
   * "#aie2026"). Used by relevance.ts to flag long unrelated posts that
   * only mention the event in passing.
   */
  exactMentions: RegExp;
  /**
   * If the windowed context around an exact mention matches this pattern,
   * the post is treated as substantively about the event. If not, it's
   * tagged as incidental.
   */
  specificEventSignal: RegExp;
  /**
   * Minimum post length before incidental-mention filtering applies.
   * AIE 2026 used 900.
   */
  minLength?: number;
}

export type RecapMode = 'auto' | 'hitl';

export interface EventConfig {
  eventId: string;
  name: string;
  /** Story definitions used by buildStoryAssignedThemes (slice 2). */
  stories: StoryDefinitionConfig[];
  /** storyId → mergeTargetStoryId for small-story consolidation (slice 2). */
  smallStoryMergeTargets: Record<string, string>;
  /** Hard overrides that beat weight summation (slice 2). */
  primaryStoryOverrides: PrimaryStoryOverride[];
  /** Phrase rules surfaced from the corpus by deriveExpansionPlan (slice 3). */
  corpusPhraseRules: Array<{ value: string; pattern: RegExp }>;
  /** Single-token entity allowlist for expand.ts noise filtering (slice 3). */
  singleTokenEntityAllowlist: string[];
  /** Anchor copy for LLM relabel pass (slice 4). */
  curatedThemeCopy: Record<string, { label: string; summary: string }>;
  /** Event-specific incidental-mention filter (slice 4). */
  incidentalMentionPatterns?: IncidentalMentionConfig;
  /** Lanes for atlas layout (slice 5). */
  atlasLanes: AtlasLaneConfig[];
  /** Operating mode: full-auto vs human-in-the-loop (slice 6). */
  recapMode: RecapMode;
}

/**
 * Narrowed config slice consumed by buildStoryAssignedThemes in
 * story-assignment.ts. Lets callers pass just the relevant subset of an
 * EventConfig without coupling to the full schema.
 */
export type StoryAssignmentConfig = Pick<
  EventConfig,
  'stories' | 'smallStoryMergeTargets' | 'primaryStoryOverrides'
>;

type ConfigLoader = () => Promise<EventConfig>;

const REGISTRY: Map<string, ConfigLoader> = new Map([
  [
    'aie-2026',
    async () => {
      const mod = await import('./fixtures/aie-2026.config');
      return mod.default;
    },
  ],
]);

/**
 * Optional Convex-backed source. When set (via setConvexConfigSource),
 * loadEventConfig consults Convex first and falls back to the in-process
 * registry if Convex doesn't have the event yet. Keeps the registry as
 * a sync default for tests + bootstrap.
 */
type ConvexConfigSource = (eventId: string) => Promise<EventConfig | undefined>;
let convexConfigSource: ConvexConfigSource | undefined;

export function setConvexConfigSource(source: ConvexConfigSource | undefined): void {
  convexConfigSource = source;
}

/**
 * Load the EventConfig for a given eventId. Resolution order:
 *  1. Convex (if a ConvexConfigSource is installed)
 *  2. In-process REGISTRY (fixtures shipped in the repo)
 *  3. undefined
 */
export async function loadEventConfig(eventId: string): Promise<EventConfig | undefined> {
  if (convexConfigSource) {
    const fromConvex = await convexConfigSource(eventId);
    if (fromConvex) return fromConvex;
  }
  const loader = REGISTRY.get(eventId);
  if (!loader) return undefined;
  return loader();
}

/**
 * Register an EventConfig loader at runtime (used by tests + future
 * Convex-backed registration). Returns a teardown function.
 */
export function registerEventConfig(eventId: string, loader: ConfigLoader): () => void {
  REGISTRY.set(eventId, loader);
  return () => {
    REGISTRY.delete(eventId);
  };
}
