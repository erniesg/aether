import Anthropic from '@anthropic-ai/sdk';
import type { CapabilityRunRecord } from '@/lib/store/runs';
import { CLAUDE_MODEL } from './generate';

/**
 * Phase 5 — pin-as-capability. Given a completed `capabilityRun`, ask Claude
 * Opus 4.7 to distil it into a reusable `CapabilityDefinition` the creator
 * can re-trigger against any layer. The system prompt is cacheable (product
 * framing + the schema of `CapabilityDefinition`); only the per-turn run
 * payload is delta.
 */

export const PROPOSAL_SYSTEM_PROMPT = [
  'You are the AI co-creator inside aether, a canvas-native creative system.',
  'Your task in this call: take a completed tool run and distil it into a reusable',
  'CapabilityDefinition the creator can re-trigger against any layer.',
  '',
  'A CapabilityDefinition is a named, re-runnable skill — not a chat reply.',
  'It captures:',
  '  • name        — 2-5 words, gerund-leaning, evocative of the creative move',
  '                  (e.g. "recolor to brand palette", "vertical story crop", "soft-key relight").',
  '  • trigger     — one short imperative sentence a creator might type in the',
  '                  composer to re-invoke this capability, written so Claude can',
  '                  parse it back later. Keep it plain, no headline voice.',
  '  • paramSchema — a JSON-schema-ish object describing parameters that could',
  '                  vary per run. Always include a `layerId` string property.',
  '                  Add other parameters only if the run meaningfully varied them.',
  '  • notes       — optional, one line, the reason this capability is worth',
  '                  pinning (what creative lever it pulls).',
  '',
  'Operating principles:',
  '  • You are not a chatbot. Call the propose_capability tool exactly once, then stop.',
  '  • Prefer terse, descriptive names over clever ones. The creator will edit.',
  '  • Do not hardcode provider or model in the trigger; those are routing concerns.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

export const PROPOSAL_TOOL: Tool = {
  name: 'propose_capability',
  description:
    'Propose a reusable CapabilityDefinition distilled from a completed tool run. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '2-5 words. Evocative of the creative move (e.g. "recolor to brand palette").',
      },
      trigger: {
        type: 'string',
        description:
          'One imperative sentence a creator could type to re-invoke this capability against a new layer.',
      },
      paramSchema: {
        type: 'object',
        description:
          'JSON-schema-ish object describing parameters for future runs. Must include at minimum a layerId string property.',
      },
      notes: {
        type: 'string',
        description: 'Optional one-line rationale explaining why this capability is worth pinning.',
      },
    },
    required: ['name', 'trigger', 'paramSchema'],
  } as unknown as Tool['input_schema'],
};

export interface ProposalResult {
  name: string;
  trigger: string;
  paramSchema: Record<string, unknown>;
  notes?: string;
}

export function parseProposalToolInput(value: unknown): ProposalResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('propose_capability tool input was not an object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.name !== 'string' || v.name.trim() === '') {
    throw new Error('propose_capability required: name');
  }
  if (typeof v.trigger !== 'string' || v.trigger.trim() === '') {
    throw new Error('propose_capability required: trigger');
  }
  if (typeof v.paramSchema !== 'object' || v.paramSchema === null) {
    throw new Error('propose_capability required: paramSchema');
  }
  return {
    name: v.name.trim(),
    trigger: v.trigger.trim(),
    paramSchema: v.paramSchema as Record<string, unknown>,
    notes: typeof v.notes === 'string' ? v.notes.trim() : undefined,
  };
}

export function buildProposalMessages(
  run: CapabilityRunRecord
): Anthropic.Messages.MessageParam[] {
  const lines = [
    'A tool run just completed on the canvas. Distil it into a reusable capability.',
    '',
    'Run record:',
    `  tool: ${run.tool}`,
    `  provider: ${run.provider}${run.model ? ` · ${run.model}` : ''}`,
    `  prompt: ${run.prompt}`,
  ];
  if (run.rewrittenPrompt && run.rewrittenPrompt !== run.prompt) {
    lines.push(`  rewrittenPrompt: ${run.rewrittenPrompt}`);
  }
  if (run.rationale) lines.push(`  rationale: ${run.rationale}`);
  if (run.aspectRatio) lines.push(`  aspectRatio: ${run.aspectRatio}`);
  if (run.latencyMs) lines.push(`  latencyMs: ${run.latencyMs}`);

  return [
    {
      role: 'user',
      content: [{ type: 'text', text: lines.join('\n') }],
    },
  ];
}

export interface ProposeCapabilityOptions {
  /** Skip the Claude call; return a deterministic local fallback. Useful for tests and demos. */
  bypassAgent?: boolean;
  /** Override the Anthropic client (tests). */
  client?: Anthropic;
}

function shouldFallbackFromAnthropic(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /ANTHROPIC_API_KEY not set/i.test(message) ||
    /credit balance is too low/i.test(message) ||
    /invalid_request_error/i.test(message) ||
    /authentication/i.test(message) ||
    /permission/i.test(message) ||
    /billing/i.test(message)
  );
}

export async function proposeCapabilityFromRun(
  run: CapabilityRunRecord,
  opts: ProposeCapabilityOptions = {}
): Promise<ProposalResult> {
  if (opts.bypassAgent) {
    return localFallback(run);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.client) {
    return localFallback(run);
  }
  const client = opts.client ?? new Anthropic({ apiKey: apiKey! });
  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: [
        { type: 'text', text: PROPOSAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [PROPOSAL_TOOL],
      tool_choice: { type: 'tool', name: 'propose_capability' },
      messages: buildProposalMessages(run),
    });
  } catch (err) {
    if (shouldFallbackFromAnthropic(err)) {
      return localFallback(run);
    }
    throw err;
  }

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === 'propose_capability'
  );
  if (!toolBlock) {
    throw new Error('Claude did not emit a propose_capability tool call');
  }
  return parseProposalToolInput(toolBlock.input);
}

function localFallback(run: CapabilityRunRecord): ProposalResult {
  const firstWords = run.prompt.split(/\s+/).slice(0, 4).join(' ').toLowerCase();
  return {
    name: firstWords || `rerun ${run.tool}`,
    trigger: `re-apply “${firstWords || run.prompt.slice(0, 32)}” to the selected layer`,
    paramSchema: {
      type: 'object',
      properties: {
        layerId: { type: 'string', description: 'The tldraw shape id to target.' },
        prompt: { type: 'string', description: 'Optional override for the stored prompt.' },
      },
      required: ['layerId'],
    },
    notes: `distilled locally from ${run.tool} via ${run.provider}`,
  };
}
