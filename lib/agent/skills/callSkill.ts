/**
 * callSkill.ts — `call_skill` Anthropic tool implementation.
 *
 * Loads a SkillRef's SKILL.md, assembles the system prompt with the skill
 * instructions as a prompt-cached ephemeral block, then runs a single
 * messages.create call. Returns `SkillRuntimeOutput`.
 *
 * Per hard rule #7 (provider-agnostic AI) the Claude model is resolved from
 * the environment rather than hardcoded. Falls back to `claude-opus-4-7`.
 *
 * ## Manifest loading
 * When `skillRef.manifestPath` is set, the manifest is loaded fresh from disk
 * at call time (ensures latest edits are picked up). The `skillRef.manifest`
 * snapshot is used as a fallback when the path cannot be read (e.g. in tests
 * where only the in-memory snapshot is supplied).
 *
 * ## Tool wiring
 * `SkillManifest.tools` is a declarative list of tool names the skill may call.
 * The caller must supply a `toolRegistry` mapping each name to an
 * `Anthropic.Tool` definition. If any declared tool is absent from the registry
 * `callSkill` throws a descriptive error rather than silently ignoring it.
 * Pass an empty registry (or omit it) for skills that declare no tools.
 *
 * ## referenceFiles
 * Each path in `manifest.referenceFiles` is resolved relative to the skill's
 * directory (the directory containing its `SKILL.md`). The file contents are
 * prepended to the system prompt with a filename header so the model can
 * reference them. Missing reference files emit a warning but do NOT abort
 * the call — the missing entry is skipped.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SkillRef, SkillManifest, SkillRuntimeInput, SkillRuntimeOutput } from './types';
import { loadSkillManifest } from './loader';

const DEFAULT_MODEL = 'claude-opus-4-7';

export interface CallSkillParams {
  skillRef: SkillRef;
  input: SkillRuntimeInput;
  /** Override the model; defaults to CLAUDE_SKILL_MODEL env var or claude-opus-4-7. */
  model?: string;
  /**
   * Registry of tool name → Anthropic.Tool definitions.
   * Required when `manifest.tools` is non-empty; each declared tool name must
   * have an entry or callSkill will throw.
   *
   * Example:
   *   toolRegistry: { read_file: READ_FILE_TOOL_DEF, write_file: WRITE_FILE_TOOL_DEF }
   */
  toolRegistry?: Record<string, Anthropic.Tool>;
}

// ---------------------------------------------------------------------------
// Manifest resolution — load from disk when manifestPath is present
// ---------------------------------------------------------------------------

/**
 * Resolve the effective manifest. Loads from `skillRef.manifestPath` when
 * present; falls back to the in-memory `skillRef.manifest` snapshot so tests
 * can supply a manifest without touching the filesystem.
 */
async function resolveManifest(skillRef: SkillRef): Promise<SkillManifest> {
  if (skillRef.manifestPath) {
    try {
      const skillDir = path.dirname(skillRef.manifestPath);
      return await loadSkillManifest(skillDir);
    } catch {
      // Path unreadable — fall through to snapshot
    }
  }
  return skillRef.manifest;
}

// ---------------------------------------------------------------------------
// referenceFiles loading
// ---------------------------------------------------------------------------

/**
 * Load each file listed in `manifest.referenceFiles`.
 * Paths are resolved relative to the skill directory (`path.dirname(manifestPath)`).
 * Missing files emit a console.warn and are skipped.
 *
 * Returns an array of { filename, content } pairs in declaration order.
 */
async function loadReferenceFiles(
  manifest: SkillManifest,
  skillDir: string
): Promise<Array<{ filename: string; content: string }>> {
  if (!manifest.referenceFiles || manifest.referenceFiles.length === 0) return [];

  const results: Array<{ filename: string; content: string }> = [];
  for (const relPath of manifest.referenceFiles) {
    const absPath = path.resolve(skillDir, relPath);
    try {
      const content = await fs.readFile(absPath, 'utf-8');
      results.push({ filename: relPath, content });
    } catch {
      console.warn(
        `[callSkill] referenceFile "${relPath}" not found at ${absPath} — skipping.`
      );
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tool resolution
// ---------------------------------------------------------------------------

/**
 * Resolve declared tool names to Anthropic.Tool objects via the registry.
 * Throws if a declared tool name has no registry entry.
 */
function resolveTools(
  declaredNames: string[],
  registry: Record<string, Anthropic.Tool>
): Anthropic.Tool[] {
  const missing = declaredNames.filter((name) => !(name in registry));
  if (missing.length > 0) {
    throw new Error(
      `[callSkill] Missing tool definitions for: ${missing.join(', ')}. ` +
      `Provide them via the toolRegistry parameter.`
    );
  }
  return declaredNames.map((name) => registry[name]!);
}

// ---------------------------------------------------------------------------
// System prompt assembly
// ---------------------------------------------------------------------------

/**
 * Build the system prompt block array for the inner skill call.
 *
 * Layout:
 *   1. Preamble (name, version, description) — not cached; varies per invocation context
 *   2. Reference file blocks (one per file) — cached; stable across invocations
 *   3. Skill instructions — cached; the hot path for repeated skill use
 *
 * The last block always carries `cache_control: { type: 'ephemeral' }` so the
 * entire system prefix up to and including it is cached on the first call and
 * reused on subsequent calls.
 */
function buildSystemBlocks(
  manifest: SkillManifest,
  referenceFiles: Array<{ filename: string; content: string }>
): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [];

  const preamble: Anthropic.TextBlockParam = {
    type: 'text',
    text: [
      `You are executing the "${manifest.name}" skill (v${manifest.version}).`,
      `Description: ${manifest.description}`,
      '',
      'Follow the instructions below precisely. Return a single JSON object on the last line of your response matching the output format described in the instructions.',
    ].join('\n'),
  };
  blocks.push(preamble);

  // Prepend each reference file as a separate text block
  for (const { filename, content } of referenceFiles) {
    blocks.push({
      type: 'text',
      text: `## Reference: ${filename}\n\n${content}`,
    });
  }

  const instructionsBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: manifest.instructions,
    // Prompt-cache everything up to and including this block.
    cache_control: { type: 'ephemeral' },
  };
  blocks.push(instructionsBlock);

  return blocks;
}

/**
 * Serialize the runtime input as a user message so the model sees what it
 * needs to act on.
 */
function buildUserMessage(input: SkillRuntimeInput): Anthropic.MessageParam {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `Execute the skill with the following input:\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  };
}

/**
 * Try to parse the last JSON object from the model's text response.
 * Skills are instructed to emit a JSON object as the last line.
 */
function extractResult(text: string): unknown {
  // Find the last {...} block in the response
  const match = text.match(/\{[\s\S]*\}(?=[^{}]*$)/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // If it parses as an object with ok+result, use it; otherwise wrap it
    }
  }
  return { raw: text };
}

/**
 * Execute a skill by its SkillRef.
 * This is the `call_skill` Anthropic tool implementation.
 */
export async function callSkill(params: CallSkillParams): Promise<SkillRuntimeOutput> {
  const { skillRef, input, model, toolRegistry = {} } = params;
  const resolvedModel =
    model ?? (typeof process !== 'undefined' ? process.env['CLAUDE_SKILL_MODEL'] : undefined) ?? DEFAULT_MODEL;

  // Resolve the manifest — load from disk when manifestPath is available,
  // fall back to the in-memory snapshot (allows tests to skip the filesystem).
  const manifest = await resolveManifest(skillRef);

  // Resolve tool definitions before making any API call so we fail fast on
  // missing registry entries.
  const resolvedTools =
    manifest.tools.length > 0 ? resolveTools(manifest.tools, toolRegistry) : [];

  // Load reference files relative to the skill directory.
  const skillDir = skillRef.manifestPath
    ? path.dirname(skillRef.manifestPath)
    : '';
  const refFileContents =
    skillDir && manifest.referenceFiles.length > 0
      ? await loadReferenceFiles(manifest, skillDir)
      : [];

  const client = new Anthropic();
  const systemBlocks = buildSystemBlocks(manifest, refFileContents);
  const userMessage = buildUserMessage(input);

  try {
    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: resolvedModel,
      max_tokens: 1024,
      system: systemBlocks,
      messages: [userMessage],
    };

    if (resolvedTools.length > 0) {
      createParams.tools = resolvedTools;
    }

    const response = await client.messages.create(createParams);

    const textContent = response.content.find((b) => b.type === 'text');
    const rawText = textContent?.type === 'text' ? textContent.text : '';
    const parsed = extractResult(rawText);

    // Extract cache hit tokens if the SDK reports them.
    // The cache fields live on the beta Usage type; cast via unknown to avoid
    // a type overlap error with the standard Usage interface.
    const usageAny = (response.usage as unknown) as Record<string, unknown> | undefined;
    const cacheHitTokens =
      typeof usageAny?.['cache_read_input_tokens'] === 'number'
        ? usageAny['cache_read_input_tokens']
        : undefined;

    // If the parsed result is already { ok, result, ... } shape, unwrap it;
    // otherwise wrap it.
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'ok' in (parsed as object) &&
      'result' in (parsed as object)
    ) {
      const p = parsed as { ok: boolean; result: unknown };
      return {
        ok: p.ok,
        result: p.result,
        cacheHitTokens,
      };
    }

    return {
      ok: true,
      result: parsed,
      cacheHitTokens,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      result: null,
      error: message,
    };
  }
}
