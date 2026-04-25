/**
 * Skills foundation types.
 *
 * A Skill is an Anthropic-first artifact: a `SKILL.md` manifest that describes
 * a reusable creative move. The loader parses it; the `call_skill` tool loads
 * it into the system prompt via prompt caching and executes the inner workflow.
 *
 * Reference: https://claude.com/blog/building-agents-with-skills-equipping-agents-for-specialized-work
 */

import type { CapabilityEntryRef } from '@/lib/capability/entry';

/** Parsed front-matter + body of a SKILL.md file. */
export interface SkillManifest {
  /** Unique kebab-case identifier, e.g. `brand-ingest`. */
  name: string;
  /** Semver-compatible integer version. */
  version: number;
  /** One-line human description shown in the capability rail. */
  description: string;
  /**
   * Anthropic tool names the skill may call during execution.
   * Passed to the inner `messages.create` call so the model knows what's
   * available.
   */
  tools: string[];
  /**
   * Paths relative to `lib/agent/skills/<skill-name>/` that are prepended to
   * the system prompt as additional context (prompt-cached).
   */
  referenceFiles: string[];
  /**
   * Full markdown body of the SKILL.md after front-matter stripping.
   * This is the canonical instruction block passed to the inner Claude call.
   */
  instructions: string;
}

/**
 * A pointer to a specific version of a loaded Skill. Stored in Convex `skill`
 * table and emitted by the capability factory when `action === 'author-skill'`.
 */
export interface SkillRef extends CapabilityEntryRef<'skill'> {
  /** Absolute FS path to the `SKILL.md` manifest. */
  manifestPath: string;
  /** Snapshot of the manifest at time of reference creation. */
  manifest: SkillManifest;
}

/** Input passed to a skill at runtime. */
export interface SkillRuntimeInput {
  /** Free-form payload; the skill's instructions describe the expected shape. */
  [key: string]: unknown;
}

/** Structured output returned by the `call_skill` tool. */
export interface SkillRuntimeOutput {
  /** Whether the skill completed without error. */
  ok: boolean;
  /**
   * The final structured result produced by the skill's executor.
   * Shape is skill-specific.
   */
  result: unknown;
  /**
   * Number of input tokens that hit the prompt cache on this invocation.
   * Useful for observability / cost tracking.
   */
  cacheHitTokens?: number;
  /** Error message if `ok === false`. */
  error?: string;
}
