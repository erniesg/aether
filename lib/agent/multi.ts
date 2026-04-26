import Anthropic from '@anthropic-ai/sdk';
import { recordRunFail, recordRunFinish, recordRunStart } from '@/lib/convex/http';
import { resolveToolEntryRef } from '@/lib/tool/registry';

/**
 * Multi-tool agent loop. Claude Opus 4.7 picks among aether's capabilities
 * (search_signals, cluster_references, generate_image, analyze_video) and
 * orchestrates them to answer a creator's intent.
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

const SYSTEM_PROMPT = [
  'You are the AI co-creator inside aether, a canvas-native creative system for individual creators.',
  '',
  'You can call these tools:',
  '- search_signals(seedText, platforms, limit): scrape Pinterest/Instagram/TikTok/XHS for visual references that match a creator brief. Returns ReferenceRecords.',
  '- cluster_references(images, minClusterSize): embed image URLs with CLIP and cluster with HDBSCAN. Returns cluster ids per image.',
  '- generate_image(prompt, aspectRatio): render one hero image. Use 1:1 by default; 4:5 for IG portrait; 9:16 for stories/reels; 16:9 for banners.',
  '- analyze_video(videoUrl, task): use Gemini to summarize / transcribe / extract moments / describe shots from a video URL.',
  '',
  'Operating principles:',
  "- You're not a chatbot. You plan, call tools, and stop when the creator's intent is satisfied.",
  '- Prefer to chain tools when the brief implies it (research → cluster → generate). Skip steps that are already implied.',
  '- When you call generate_image, write a visually specific prompt: subject, composition, light, colour, style. Keep under 220 chars.',
  '- Stop and emit a brief summary text once the result is in hand.',
].join('\n');

type Tool = Anthropic.Messages.Tool;

const TOOL_SEARCH_SIGNALS: Tool = {
  name: 'search_signals',
  description:
    'Scrape Pinterest / Instagram / TikTok / Xiaohongshu for visual references matching a creative brief. Returns the URL and metadata of each found post.',
  input_schema: {
    type: 'object',
    properties: {
      seedText: { type: 'string', description: 'Creator brief or keyword. e.g. "streetwear lookbook" or "minimal kitchenware".' },
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['instagram', 'pinterest', 'tiktok', 'xiaohongshu'] },
        description: 'Platforms to scrape. Default: ["instagram"]',
      },
      limit: { type: 'number', description: 'Per-platform record cap. Default 12.' },
    },
    required: ['seedText'],
  } as unknown as Tool['input_schema'],
};

const TOOL_CLUSTER_REFERENCES: Tool = {
  name: 'cluster_references',
  description:
    'Embed a batch of image URLs with CLIP ViT-B/32 and cluster with HDBSCAN + UMAP. Use after search_signals to group references into visual themes.',
  input_schema: {
    type: 'object',
    properties: {
      images: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
          },
          required: ['id', 'url'],
        },
      },
      minClusterSize: { type: 'number', description: 'HDBSCAN tuning. Smaller finds tighter clusters. Default 3.' },
    },
    required: ['images'],
  } as unknown as Tool['input_schema'],
};

const TOOL_GENERATE_IMAGE: Tool = {
  name: 'generate_image',
  description:
    'Render one hero image. The provider (OpenAI / Gemini / Replicate / Volcengine Seedream) is selected at runtime from env.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Visually specific prompt. Subject, composition, light, colour, style. Under 220 chars.' },
      aspectRatio: {
        type: 'string',
        enum: ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'],
        description: '1:1 default. IG portrait 4:5. Story/reel 9:16. Banner 16:9.',
      },
    },
    required: ['prompt', 'aspectRatio'],
  } as unknown as Tool['input_schema'],
};

const TOOL_ANALYZE_VIDEO: Tool = {
  name: 'analyze_video',
  description:
    'Send a video URL to Gemini for understanding. Use task=summarize for a quick brief, transcribe for spoken dialogue, extract-moments for visual peaks, describe-shots for camera work.',
  input_schema: {
    type: 'object',
    properties: {
      videoUrl: { type: 'string', description: 'Direct URL to the video file (mp4, mov, webm, etc.).' },
      task: {
        type: 'string',
        enum: ['summarize', 'transcribe', 'extract-moments', 'describe-shots', 'free-form'],
        description: 'Default summarize.',
      },
      prompt: { type: 'string', description: 'Optional override prompt; only used when task=free-form.' },
    },
    required: ['videoUrl'],
  } as unknown as Tool['input_schema'],
};

const ALL_TOOLS: Tool[] = [
  TOOL_SEARCH_SIGNALS,
  TOOL_CLUSTER_REFERENCES,
  TOOL_GENERATE_IMAGE,
  TOOL_ANALYZE_VIDEO,
];

export interface MultiAgentParams {
  prompt: string;
  baseUrl: string;
  maxIterations?: number;
  /** Convex workspace document id. When supplied, every tool step is scoped
   *  to that workspace in the runs ledger so the right rail shows them. */
  wsId?: string;
  /** Optional reference image for hero renders. When set, every
   *  generate_image tool dispatch attaches this as `refs[0]` so the
   *  underlying provider does an image-to-image render instead of
   *  text-only. Adapters that don't support refs degrade gracefully —
   *  the prompt should still mention the reference. */
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

interface ToolDispatchSpec {
  /** Local id used by the registry + provenance. */
  registryId: string;
  /** HTTP route on this same Next app. */
  path: string;
  /** Best-known provider stub at start time. The route's response usually
   *  patches this with the actual adapter on finish. */
  provider: string;
  /** Best-known model stub at start time. */
  model: string;
  /** Map the agent tool name → /api request body. */
  toBody: (input: unknown) => unknown;
  /** Pull a refined provider/model from the API response, when it carries
   *  enough information to attribute the work. */
  pickProvider?: (output: unknown) => { provider?: string; model?: string };
}

const TOOL_SPECS: Record<string, ToolDispatchSpec> = {
  search_signals: {
    registryId: 'signals-search',
    path: '/api/research',
    provider: 'multi',
    model: 'signals-research',
    toBody: (input) => {
      const i = input as { seedText: string; platforms?: string[]; limit?: number };
      return {
        seedText: i.seedText,
        platforms: i.platforms ?? ['instagram'],
        limit: i.limit ?? 12,
      };
    },
  },
  cluster_references: {
    registryId: 'clusters-run',
    path: '/api/clusters/run',
    provider: 'modal-clip',
    model: 'clip-vit-b32',
    toBody: (input) => input,
    pickProvider: (output) => {
      const o = output as Record<string, unknown> | undefined;
      const provider = typeof o?.provider === 'string' ? (o.provider as string) : undefined;
      return provider ? { provider } : {};
    },
  },
  generate_image: {
    registryId: 'image-gen',
    path: '/api/generate',
    provider: 'auto',
    model: 'auto',
    toBody: (input) => {
      const i = input as { prompt: string; aspectRatio: string };
      return { prompt: i.prompt, aspectRatioOverride: i.aspectRatio };
    },
    pickProvider: (output) => {
      const o = output as Record<string, unknown> | undefined;
      const provider = typeof o?.provider === 'string' ? (o.provider as string) : undefined;
      const plan = (o?.plan as Record<string, unknown> | undefined) ?? undefined;
      const model = typeof plan?.model === 'string' ? (plan.model as string) : undefined;
      return { ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
    },
  },
  analyze_video: {
    registryId: 'video-understand',
    path: '/api/video-understand',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    toBody: (input) => input,
    pickProvider: (output) => {
      const o = output as Record<string, unknown> | undefined;
      const provider = typeof o?.provider === 'string' ? (o.provider as string) : undefined;
      const model = typeof o?.modelId === 'string' ? (o.modelId as string) : undefined;
      return { ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
    },
  },
};

function genClientRunId(name: string): string {
  return `agent_${name}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Inject `refs[0]` into a generate_image body. /api/generate's request
 * shape already accepts `refs: ImageRef[] = [{ url, weight? }]`. Both
 * remote URLs and `data:` base64 URIs are valid here — the adapters that
 * support image-to-image fetch the URL string verbatim.
 */
function attachReferenceImage(
  baseBody: unknown,
  ref: { url?: string; dataUrl?: string }
): unknown {
  const refUrl = ref.url ?? ref.dataUrl;
  if (!refUrl) return baseBody;
  if (typeof baseBody !== 'object' || baseBody === null) return baseBody;
  return { ...(baseBody as Record<string, unknown>), refs: [{ url: refUrl }] };
}

async function dispatchTool(
  name: string,
  input: unknown,
  baseUrl: string,
  wsId: string | undefined,
  referenceImage?: { url?: string; dataUrl?: string }
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

  // Build the request body. For generate_image, transparently attach a
  // reference image (when supplied at the loop level) — the agent's tool
  // schema doesn't expose this so Claude doesn't need to manage the
  // reference URL/dataUrl lifecycle.
  const baseBody = spec.toBody(input);
  const body =
    name === 'generate_image' && referenceImage
      ? attachReferenceImage(baseBody, referenceImage)
      : baseBody;

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

function summarizeToolOutput(name: string, output: unknown): string {
  // Compact tool output before sending back to Claude — large payloads (image
  // bytes, big embedding vectors) eat tokens fast. Keep enough so Claude can
  // reason; drop the heavy parts.
  if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
  const o = output as Record<string, unknown>;
  if (name === 'search_signals') {
    const records = (o.records as Array<Record<string, unknown>>) ?? [];
    return JSON.stringify({
      ok: o.ok,
      signalCount: o.signalCount,
      records: records.slice(0, 8).map((r) => ({
        id: r.id,
        title: r.title,
        attribution: r.attribution,
        fullUrl: r.fullUrl,
        tags: r.tags,
      })),
    });
  }
  if (name === 'cluster_references') {
    const items = (o.items as Array<Record<string, unknown>>) ?? [];
    return JSON.stringify({
      ok: o.ok,
      nClusters: o.nClusters,
      nNoise: o.nNoise,
      provider: o.provider,
      items: items.map((it) => ({ id: it.id, clusterId: it.clusterId, umap: it.umap })),
    });
  }
  if (name === 'generate_image') {
    return JSON.stringify({
      ok: o.ok,
      provider: o.provider,
      plan: o.plan,
      // strip the b64/data URL bytes
      result: o.result ? { width: (o.result as Record<string, unknown>).width, height: (o.result as Record<string, unknown>).height } : null,
    });
  }
  if (name === 'analyze_video') {
    return JSON.stringify({ ok: o.ok, provider: o.provider, modelId: o.modelId, text: o.text, usageMs: o.usageMs });
  }
  return JSON.stringify(output);
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

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const t0 = Date.now();
      const dispatch = await dispatchTool(
        block.name,
        block.input,
        params.baseUrl,
        params.wsId,
        params.referenceImage
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
