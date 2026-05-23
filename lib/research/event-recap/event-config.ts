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

export interface StoryDefinitionConfig {
  storyId: string;
  label: string;
  summary: string;
  keywords: string[];
  signals: Array<{ pattern: RegExp; weight: number }>;
}

export interface AtlasLaneConfig {
  id: string;
  label: string;
  x: number;
  matchers: {
    primary: RegExp;
    program?: RegExp;
    tools?: RegExp;
    community?: RegExp;
  };
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
 * Load the EventConfig for a given eventId. Returns undefined if no
 * config is registered.
 *
 * Registration today is via the in-process REGISTRY map; a future slice
 * adds a Convex `eventConfig` table loader that this function consults
 * before falling back to the in-process registry.
 */
export async function loadEventConfig(eventId: string): Promise<EventConfig | undefined> {
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
