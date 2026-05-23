import type { EventConfig } from '../event-config';

/**
 * AIE Singapore 2026 event configuration.
 *
 * Skeleton-only in slice 1. Subsequent slices migrate:
 *  - slice 2: stories[] + smallStoryMergeTargets + primaryStoryOverrides
 *    (lifted from lib/research/event-recap/story-assignment.ts)
 *  - slice 3: corpusPhraseRules + singleTokenEntityAllowlist
 *    (lifted from lib/research/event-recap/expand.ts)
 *  - slice 4: curatedThemeCopy + incidentalMentionPatterns
 *    (lifted from scripts/event-recap-finalize-analysis.ts + relevance.ts)
 *  - slice 5: atlasLanes
 *    (lifted from workers/aie2026-vibes.ts:605)
 */
const config: EventConfig = {
  eventId: 'aie-2026',
  name: 'AI Engineer Summit Singapore 2026',
  stories: [],
  smallStoryMergeTargets: {},
  primaryStoryOverrides: [],
  corpusPhraseRules: [],
  singleTokenEntityAllowlist: [],
  curatedThemeCopy: {},
  atlasLanes: [],
  recapMode: 'auto',
};

export default config;
