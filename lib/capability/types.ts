/**
 * Capability-definition types. Mirrors the `capabilityDefinition` table in
 * `convex/schema.ts`; we ship an in-memory version first (see
 * `lib/store/runs.ts` for the same pattern) so the hackathon hero flow works
 * before the Convex project is provisioned. Swap-in is one file per store.
 */

export type CapabilityTool =
  | 'image-gen'
  | 'image-edit'
  | 'bg-fill'
  | 'cutout'
  | 'relight'
  | 'splat';

/**
 * Minimum shape needed to re-run the same tool-chain against a new layer.
 * The template is deliberately loose — anything serialisable — so the agent
 * can learn new chains without us touching this file.
 */
export interface CapabilityRunTemplate {
  prompt?: string;
  aspectRatio?: string;
  seed?: number;
  style?: Record<string, unknown>;
  /** Provider-routing hint; still resolved via the registry, never hardcoded. */
  providerId?: string;
  model?: string;
}

export interface CapabilityParamSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface CapabilityDefinitionInit {
  name: string;
  trigger: string;
  paramSchema: CapabilityParamSchema | Record<string, unknown>;
  exampleRunId?: string;
  createdBy: 'human' | 'agent';
  notes?: string;
  tool: string;
  provider: string;
  runTemplate: CapabilityRunTemplate;
}

export interface CapabilityDefinitionRecord extends CapabilityDefinitionInit {
  id: string;
  version: number;
  createdAt: number;
}
