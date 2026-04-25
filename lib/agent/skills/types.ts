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
   * Declarative list of Anthropic tool names the skill may call during
   * execution. These are tool NAMES only — the caller is responsible for
   * supplying the corresponding `Anthropic.Tool` definitions via
   * `CallSkillParams.toolRegistry`. `callSkill` will throw a descriptive
   * error if any declared name is absent from the registry.
   */
  tools: string[];
  /**
   * Paths relative to the skill directory (the directory containing its
   * `SKILL.md`) that are prepended to the system prompt as additional
   * context before the instruction block. Each file's content is wrapped
   * in a `## Reference: <filename>` header.
   *
   * Convention:
   *   - Files shipped WITH the skill (notes, examples, snippets) → skill-relative,
   *     e.g. `notes.md`, `examples/foo.json`.
   *   - External repo types that the skill depends on → copy the relevant
   *     portion into a `.snippet.ts` file in the skill dir rather than
   *     referencing repo-absolute paths.
   *
   * Missing files emit a warning and are skipped; they do not abort the call.
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
  /**
   * Absolute FS path to the `SKILL.md` manifest.
   *
   * When present, `callSkill` loads the manifest fresh from disk at call time
   * so edits to the file take effect without rebuilding the SkillRef. The
   * `manifest` snapshot below is used as a fallback if the path is unreadable
   * (e.g. in tests that only supply an in-memory manifest).
   */
  manifestPath: string;
  /**
   * Snapshot of the manifest captured at SkillRef creation time.
   * Used as the fallback when `manifestPath` cannot be read, and as the sole
   * manifest source in tests that do not touch the filesystem.
   */
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
