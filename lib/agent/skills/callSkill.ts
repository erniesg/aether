/**
 * callSkill.ts — `call_skill` Anthropic tool implementation.
 *
 * Loads a SkillRef's SKILL.md, assembles the system prompt with the skill
 * instructions as a prompt-cached ephemeral block, then runs a single
 * messages.create call. Returns `SkillRuntimeOutput`.
 *
 * Per hard rule #7 (provider-agnostic AI) the Claude model is resolved from
 * the environment rather than hardcoded. Falls back to `claude-opus-4-7`.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SkillRef, SkillRuntimeInput, SkillRuntimeOutput } from './types';

const DEFAULT_MODEL = 'claude-opus-4-7';

export interface CallSkillParams {
  skillRef: SkillRef;
  input: SkillRuntimeInput;
  /** Override the model; defaults to CLAUDE_SKILL_MODEL env var or claude-opus-4-7. */
  model?: string;
}

/**
 * Build the system prompt block array for the inner skill call.
 * The skill instructions block gets `cache_control: { type: 'ephemeral' }`
 * so repeated invocations of the same skill hit the prompt cache.
 */
function buildSystemBlocks(manifest: SkillRef['manifest']): Anthropic.TextBlockParam[] {
  const preamble: Anthropic.TextBlockParam = {
    type: 'text',
    text: [
      `You are executing the "${manifest.name}" skill (v${manifest.version}).`,
      `Description: ${manifest.description}`,
      '',
      'Follow the instructions below precisely. Return a single JSON object on the last line of your response matching the output format described in the instructions.',
    ].join('\n'),
  };

  const instructionsBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: manifest.instructions,
    // Prompt-cache the instructions so repeated invocations are cheap.
    cache_control: { type: 'ephemeral' },
  };

  return [preamble, instructionsBlock];
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
  const { skillRef, input, model } = params;
  const resolvedModel =
    model ?? (typeof process !== 'undefined' ? process.env['CLAUDE_SKILL_MODEL'] : undefined) ?? DEFAULT_MODEL;

  const client = new Anthropic();
  const systemBlocks = buildSystemBlocks(skillRef.manifest);
  const userMessage = buildUserMessage(input);

  try {
    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: 1024,
      system: systemBlocks,
      messages: [userMessage],
    });

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
