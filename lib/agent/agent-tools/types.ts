/**
 * Agent-tools registry types (slice #4).
 *
 * Each agent tool is one file in `lib/agent/agent-tools/`. The file exports
 * an `AgentTool` shape carrying a provider-neutral tool definition, the dispatch
 * spec the runMultiAgent loop uses to actually run the tool, and an optional
 * output summarizer that compacts large payloads before the planner re-reads them
 * (image bytes, embedding vectors).
 *
 * Adding a tool: drop a file in this directory exporting an AgentTool, then
 * add it to `listAgentTools()` in `index.ts`. No edit to multi.ts required.
 */

import type { CommandToolDefinition } from '@/lib/providers/llm/types';

export interface ToolDispatchSpec {
  /** Local id used by the registry + provenance ledger. */
  registryId: string;
  /** HTTP route on this same Next app. Mutually exclusive with `local`. */
  path?: string;
  /**
   * Pure-local handler — no network round-trip. Returns the JSON-shaped
   * output the agent loop expects. Used for cheap synchronous tools like
   * get_current_datetime.
   */
  local?: (input: unknown) => Promise<unknown> | unknown;
  /** Best-known provider stub at start time (refined on finish from response). */
  provider: string;
  /** Best-known model stub at start time. */
  model: string;
  /** Map agent tool input → API request body. Required for HTTP tools. */
  toBody?: (input: unknown) => unknown;
  /** Pull a refined provider/model from the response, when available. */
  pickProvider?: (output: unknown) => { provider?: string; model?: string };
}

export interface AgentTool {
  /** Provider-neutral Tool spec — adapters translate it to API-specific shape. */
  tool: CommandToolDefinition;
  /** Dispatch spec — how the loop runs the tool when the planner calls it. */
  dispatch: ToolDispatchSpec;
  /**
   * Optional output compaction before re-sending to the planner. Drops heavy
   * byte streams (image bytes, embedding vectors) so the conversation
   * doesn't blow the context window. Defaults to JSON.stringify.
   */
  summarizeOutput?: (output: unknown) => string;
}
