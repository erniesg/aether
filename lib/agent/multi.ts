import Anthropic from '@anthropic-ai/sdk';
import { recordRunFail, recordRunFinish, recordRunStart } from '@/lib/convex/http';
import { resolveToolEntryRef } from '@/lib/tool/registry';
import { listAgentTools, type AgentTool, type ToolDispatchSpec } from './agent-tools';

/**
 * Multi-tool agent loop. Claude Opus 4.7 picks among aether's capabilities
 * (search_signals, cluster_references, generate_image, analyze_video,
 * get_current_datetime) and orchestrates them to answer a creator's intent.
 *
 * The tool catalog lives in `lib/agent/agent-tools/` — one file per tool.
 * `listAgentTools()` is the single source of truth; multi.ts no longer
 * hardcodes per-tool dispatch (slice #4 refactor). Adding a tool is one new
 * file + one line in agent-tools/index.ts.
 *
 * Each tool dispatch writes to the `capabilityRun` ledger with a typed
 * ToolRef so every step the agent takes shows up in the right rail next to
 * the hand-driven runs. Logging is fail-soft — a Convex outage downgrades
 * the ledger to best-effort and the agent loop keeps running.
 *
 * The loop is intentionally short (max 6 iterations). Cost-aware: forced
 * tool-use is OFF — Claude can answer directly when no tool is needed.
 */

export const CLAUDE_MODEL = 'claude-opus-4-7';

type Tool = Anthropic.Messages.Tool;

const REGISTERED_TOOLS: AgentTool[] = listAgentTools();
const ALL_TOOLS: Tool[] = REGISTERED_TOOLS.map((t) => t.tool);
const TOOL_SPECS: Record<string, ToolDispatchSpec> = Object.fromEntries(
  REGISTERED_TOOLS.map((t) => [t.tool.name, t.dispatch])
);
const TOOL_SUMMARIZERS: Record<string, (output: unknown) => string> =
  Object.fromEntries(
    REGISTERED_TOOLS.filter((t) => typeof t.summarizeOutput === 'function').map(
      (t) => [t.tool.name, t.summarizeOutput as (output: unknown) => string]
    )
  );

const SYSTEM_PROMPT_TOOL_LIST = REGISTERED_TOOLS.map(
  (t) => `- ${t.tool.name}: ${t.tool.description}`
).join('\n');

const SYSTEM_PROMPT = [
  'You are the AI co-creator inside aether, a canvas-native creative system for individual creators.',
  '',
  'You can call these tools:',
  SYSTEM_PROMPT_TOOL_LIST,
  '',
  'Operating principles:',
  "- You're not a chatbot. You plan, call tools, and stop when the creator's intent is satisfied.",
  '- Prefer to chain tools when the brief implies it (research → cluster → generate). Skip steps that are already implied.',
  '- When you call generate_image, write a visually specific prompt: subject, composition, light, colour, style. Keep under 220 chars.',
  '- For anything time-sensitive, call get_current_datetime first — never assume the date from training data.',
  '- Stop and emit a brief summary text once the result is in hand.',
].join('\n');

export interface MultiAgentParams {
  prompt: string;
  baseUrl: string;
  maxIterations?: number;
  /** Convex workspace document id. When supplied, every tool step is scoped
   *  to that workspace in the runs ledger so the right rail shows them. */
  wsId?: string;
  /**
   * Optional reference images for hero renders. When set, every
   * generate_image tool dispatch attaches them as `refs[]` so the
   * underlying provider does an image-to-image render. Adapters that don't
   * support refs degrade gracefully — the prompt should still mention them.
   *
   * Multi-image: pass several refs to bias the hero toward a brand kit /
   * product photo set. The legacy singular `referenceImage` field is also
   * accepted and gets folded into refs[0] for callers that haven't migrated.
   */
  referenceImages?: Array<{ url?: string; dataUrl?: string }>;
  /** @deprecated — use referenceImages. Kept for back-compat. */
  referenceImage?: { url?: string; dataUrl?: string };
}

export interface MultiAgentToolStep {
  index: number;
  name: string;
  input: unknown;
  output?: unknown;
  ok: boolean;
  errorMessage?: string;
  ms: number;
  /** clientRunId of the ledger row written for this step (when Convex was
   *  reachable). Undefined when the recorder was a no-op. */
  clientRunId?: string;
}

export interface MultiAgentResult {
  finalText: string;
  steps: MultiAgentToolStep[];
  iterations: number;
  stopReason: string | null;
}

function genClientRunId(name: string): string {
  return `agent_${name}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Inject `refs[]` into a generate_image body. /api/generate's request shape
 * accepts `refs: ImageRef[] = [{ url, weight? }]`. Remote URLs and
 * `data:` base64 URIs are both valid — adapters that support image-to-image
 * fetch the URL string verbatim. Multiple refs let downstream adapters
 * blend brand kit + product photo sets.
 */
function attachReferenceImages(
  baseBody: unknown,
  refs: ReadonlyArray<{ url?: string; dataUrl?: string }>
): unknown {
  if (!refs.length) return baseBody;
  if (typeof baseBody !== 'object' || baseBody === null) return baseBody;
  const refsBody = refs
    .map((r) => ({ url: r.url ?? r.dataUrl }))
    .filter((r): r is { url: string } => typeof r.url === 'string' && r.url.length > 0);
  if (!refsBody.length) return baseBody;
  return { ...(baseBody as Record<string, unknown>), refs: refsBody };
}

async function dispatchTool(
  name: string,
  input: unknown,
  baseUrl: string,
  wsId: string | undefined,
  referenceImages?: ReadonlyArray<{ url?: string; dataUrl?: string }>
): Promise<
  | { ok: true; output: unknown; clientRunId?: string }
  | { ok: false; errorMessage: string; clientRunId?: string }
> {
  const spec = TOOL_SPECS[name];
  if (!spec) return { ok: false, errorMessage: `unknown tool ${name}` };

  const clientRunId = genClientRunId(spec.registryId);
  const promptForLedger = JSON.stringify(input);

  // Best-effort start record. If Convex is offline, recordRunStart no-ops
  // and we move on — the loop must not block on the ledger.
  await recordRunStart({
    clientRunId,
    wsId,
    tool: spec.registryId,
    provider: spec.provider,
    model: spec.model,
    prompt: promptForLedger,
    entryRef: resolveToolEntryRef(spec.registryId),
  });

  // Local tools (e.g. get_current_datetime) skip the network round-trip.
  if (spec.local) {
    const startedAt = Date.now();
    try {
      const out = await spec.local(input);
      const latencyMs = Date.now() - startedAt;
      await recordRunFinish(clientRunId, {
        status: 'ok',
        latencyMs,
        provider: spec.provider,
        model: spec.model,
      });
      return { ok: true, output: out, clientRunId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordRunFail(clientRunId, message);
      return { ok: false, errorMessage: message, clientRunId };
    }
  }

  if (!spec.toBody || !spec.path) {
    return {
      ok: false,
      errorMessage: `tool ${name} has neither local nor http handler`,
      clientRunId,
    };
  }

  // Build the request body. For generate_image, transparently attach
  // reference image(s) (when supplied at the loop level) — the agent's
  // tool schema doesn't expose this so Claude doesn't need to manage the
  // reference URL/dataUrl lifecycle.
  const baseBody = spec.toBody(input);
  const body =
    name === 'generate_image' && referenceImages && referenceImages.length > 0
      ? attachReferenceImages(baseBody, referenceImages)
      : baseBody;
  if (name === 'generate_image') {
    const refList = referenceImages ?? [];
    // eslint-disable-next-line no-console
    console.log(
      `[multi-agent/dispatch] generate_image — refs in scope=${refList.length}, attached=${
        name === 'generate_image' && refList.length > 0
      }`
    );
    refList.forEach((r, i) => {
      const u = r.url ?? r.dataUrl ?? '';
      const isData = u.startsWith('data:');
      // eslint-disable-next-line no-console
      console.log(
        `[multi-agent/dispatch]   ref[${i}] ${isData ? 'DATA' : 'URL'} ${
          isData ? `${Math.round(u.length / 1024)}KB b64` : u.slice(0, 80)
        }`
      );
    });
  }

  const startedAt = Date.now();
  try {
    const r = await fetch(`${baseUrl}${spec.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - startedAt;

    // /api/generate streams as text/event-stream. Parse the SSE feed and
    // synthesise a JSON-shaped output that downstream code (Auto Mode hero
    // extraction, summarizeToolOutput) already understands.
    const contentType = r.headers.get('content-type') ?? '';
    const isSse = contentType.includes('text/event-stream');

    if (!r.ok && !isSse) {
      const errBody = await r.text();
      const err = `${spec.path} → HTTP ${r.status}: ${errBody.slice(0, 400)}`;
      await recordRunFail(clientRunId, err, r.status);
      return { ok: false, errorMessage: err, clientRunId };
    }

    let json: unknown;
    if (isSse) {
      const sseResult = await readGenerateSse(r);
      if (!sseResult.ok) {
        await recordRunFail(clientRunId, sseResult.error);
        return { ok: false, errorMessage: sseResult.error, clientRunId };
      }
      json = sseResult.synthetic;
    } else {
      json = await r.json();
    }

    const refined = spec.pickProvider ? spec.pickProvider(json) : {};
    await recordRunFinish(clientRunId, {
      status: 'ok',
      latencyMs,
      provider: refined.provider ?? spec.provider,
      model: refined.model ?? spec.model,
    });
    return { ok: true, output: json, clientRunId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRunFail(clientRunId, message);
    return { ok: false, errorMessage: message, clientRunId };
  }
}

/**
 * Read /api/generate's text/event-stream feed and synthesise the
 * non-streaming shape pickHeroImageUrl + downstream tooling expect:
 * `{ ok, provider, plan, result: { images: [{url, width, height, mimeType}] }, imageUrl }`.
 *
 * The stream emits `event: generate\ndata: <JSON>\n\n` frames; we parse
 * each frame and watch for `run.completed`. The image url is captured
 * eagerly from the first `frame.completed` event so a stream that ends
 * without a clean run.completed still produces a usable output.
 */
async function readGenerateSse(
  response: Response
): Promise<{ ok: true; synthetic: unknown } | { ok: false; error: string }> {
  const body = response.body;
  if (!body) return { ok: false, error: 'generate stream body missing' };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let firstImage: { url: string; width?: number; height?: number; mimeType?: string } | null =
    null;
  let provider: { id?: string; model?: string } = {};
  let plan: Record<string, unknown> = {};
  let runCompleted: Record<string, unknown> | null = null;
  let runError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
      if (dataLine) {
        const payload = dataLine.slice('data:'.length).trim();
        try {
          const event = JSON.parse(payload) as Record<string, unknown> & {
            type?: string;
          };
          switch (event.type) {
            case 'plan.ready': {
              const provRef = event.provider as Record<string, unknown> | undefined;
              provider = {
                id: typeof provRef?.id === 'string' ? (provRef.id as string) : undefined,
                model:
                  typeof provRef?.model === 'string' ? (provRef.model as string) : undefined,
              };
              plan = {
                rewrittenPrompt: event.rewrittenPrompt,
                aspectRatio: event.aspectRatio,
                rationale: event.rationale,
                model: provider.model,
              };
              break;
            }
            case 'frame.completed': {
              const img = event.image as Record<string, unknown> | undefined;
              if (img && typeof img.url === 'string' && !firstImage) {
                firstImage = {
                  url: img.url,
                  width: typeof img.width === 'number' ? img.width : undefined,
                  height: typeof img.height === 'number' ? img.height : undefined,
                  mimeType:
                    typeof img.mimeType === 'string' ? img.mimeType : undefined,
                };
              }
              break;
            }
            case 'frame.failed': {
              if (typeof event.error === 'string') runError = event.error;
              break;
            }
            case 'run.completed': {
              runCompleted = event;
              if (
                typeof event.firstImageUrl === 'string' &&
                !firstImage
              ) {
                firstImage = { url: event.firstImageUrl };
              }
              // Prefer the more specific frame.failed reason if we already
              // have one — the run-level message is usually a generic
              // "all frames failed".
              if (typeof event.error === 'string' && !runError) {
                runError = event.error;
              }
              break;
            }
            default:
              break;
          }
        } catch {
          // skip malformed frame
        }
      }
      boundary = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  if (!firstImage) {
    return {
      ok: false,
      error:
        runError ??
        (runCompleted
          ? `generate stream completed without an image (status=${
              (runCompleted as { status?: string }).status ?? 'unknown'
            })`
          : 'generate stream ended before any frame completed'),
    };
  }

  return {
    ok: true,
    synthetic: {
      ok: true,
      provider: provider.id,
      plan,
      result: { images: [firstImage] },
      imageUrl: firstImage.url,
    },
  };
}

/**
 * Compact a tool output before sending it back to Claude — large payloads
 * (image bytes, embedding vectors) eat tokens fast. Each tool's
 * `summarizeOutput` (registered in lib/agent/agent-tools/) drops the heavy
 * parts. Tools without one fall through to JSON.stringify.
 */
function summarizeToolOutput(name: string, output: unknown): string {
  const summarizer = TOOL_SUMMARIZERS[name];
  if (summarizer) return summarizer(output);
  return JSON.stringify(output ?? null);
}

export async function runMultiAgent(params: MultiAgentParams): Promise<MultiAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });

  const maxIter = params.maxIterations ?? 6;
  const steps: MultiAgentToolStep[] = [];
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: [{ type: 'text', text: params.prompt }] },
  ];

  let iter = 0;
  let lastStopReason: string | null = null;
  let finalText = '';

  while (iter < maxIter) {
    iter += 1;
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: ALL_TOOLS,
      messages,
    });
    lastStopReason = msg.stop_reason ?? null;

    const toolUses = msg.content.filter(
      (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use'
    );
    const textBlocks = msg.content.filter(
      (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text'
    );

    // Append assistant turn to history.
    messages.push({ role: 'assistant', content: msg.content });

    if (toolUses.length === 0) {
      finalText = textBlocks.map((t) => t.text).join('\n').trim();
      break;
    }

    // Fold the legacy singular referenceImage into the plural list so a
    // single dispatch path handles both. Order matters — explicit
    // referenceImages take precedence; the legacy field is appended.
    const refs: Array<{ url?: string; dataUrl?: string }> = [
      ...(params.referenceImages ?? []),
      ...(params.referenceImage ? [params.referenceImage] : []),
    ];
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const t0 = Date.now();
      const dispatch = await dispatchTool(
        block.name,
        block.input,
        params.baseUrl,
        params.wsId,
        refs.length > 0 ? refs : undefined
      );
      const ms = Date.now() - t0;
      if (dispatch.ok) {
        steps.push({
          index: steps.length,
          name: block.name,
          input: block.input,
          output: dispatch.output,
          ok: true,
          ms,
          clientRunId: dispatch.clientRunId,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: summarizeToolOutput(block.name, dispatch.output),
        });
      } else {
        steps.push({
          index: steps.length,
          name: block.name,
          input: block.input,
          ok: false,
          errorMessage: dispatch.errorMessage,
          ms,
          clientRunId: dispatch.clientRunId,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `ERROR: ${dispatch.errorMessage}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  if (!finalText && lastStopReason !== 'end_turn') {
    finalText = `Loop hit max iterations (${maxIter}) without a final answer.`;
  }

  return { finalText, steps, iterations: iter, stopReason: lastStopReason };
}
