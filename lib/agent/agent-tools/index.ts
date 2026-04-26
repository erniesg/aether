/**
 * Agent-tools registry (slice #4 — tool discoverability refactor).
 *
 * Single source of truth for the agent's capabilities. multi.ts consumes
 * this to build the SDK Tool list, the dispatch table, and the system
 * prompt's "you can call these tools" section. Adding a new tool:
 *
 *   1. Drop a file in this directory exporting an `AgentTool`.
 *   2. Add it to the `listAgentTools()` return below.
 *
 * No other edit to multi.ts required.
 */

import { searchSignals } from './search-signals';
import { clusterReferences } from './cluster-references';
import { generateImage } from './generate-image';
import { analyzeVideo } from './analyze-video';
import { getCurrentDatetime } from './get-current-datetime';
import type { AgentTool } from './types';

export type { AgentTool, ToolDispatchSpec } from './types';

export function listAgentTools(): AgentTool[] {
  return [
    searchSignals,
    clusterReferences,
    generateImage,
    analyzeVideo,
    getCurrentDatetime,
  ];
}
