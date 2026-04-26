import Anthropic from '@anthropic-ai/sdk';

/**
 * Multi-tool agent loop. Claude Opus 4.7 picks among aether's capabilities
 * (search_signals, cluster_references, generate_image, analyze_video) and
 * orchestrates them to answer a creator's intent.
 *
 * This is the "first-class agentic surface" wiring on top of the existing
 * single-tool image-gen planner (lib/agent/generate.ts) and the per-flow
 * agents (text-apply, sketch-to-component, edit-component). Each tool here
 * dispatches to the corresponding /api route in this same Next.js app, so
 * the surface stays HTTP-uniform — an MCP server later can wrap the same
 * tool list without refactoring.
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
}

export interface MultiAgentToolStep {
  index: number;
  name: string;
  input: unknown;
  output?: unknown;
  ok: boolean;
  errorMessage?: string;
  ms: number;
}

export interface MultiAgentResult {
  finalText: string;
  steps: MultiAgentToolStep[];
  iterations: number;
  stopReason: string | null;
}

async function dispatchTool(
  name: string,
  input: unknown,
  baseUrl: string
): Promise<{ ok: true; output: unknown } | { ok: false; errorMessage: string }> {
  const ROUTES: Record<string, string> = {
    search_signals: '/api/research',
    cluster_references: '/api/clusters/run',
    generate_image: '/api/generate',
    analyze_video: '/api/video-understand',
  };
  const path = ROUTES[name];
  if (!path) return { ok: false, errorMessage: `unknown tool ${name}` };

  let body: unknown;
  if (name === 'search_signals') {
    const i = input as { seedText: string; platforms?: string[]; limit?: number };
    body = {
      seedText: i.seedText,
      platforms: i.platforms ?? ['instagram'],
      limit: i.limit ?? 12,
    };
  } else if (name === 'cluster_references') {
    body = input;
  } else if (name === 'generate_image') {
    const i = input as { prompt: string; aspectRatio: string };
    body = { prompt: i.prompt, aspectRatioOverride: i.aspectRatio };
  } else if (name === 'analyze_video') {
    body = input;
  } else {
    body = input;
  }

  try {
    const r = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) {
      return { ok: false, errorMessage: `${path} → HTTP ${r.status}: ${JSON.stringify(json)}` };
    }
    return { ok: true, output: json };
  } catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
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
      const dispatch = await dispatchTool(block.name, block.input, params.baseUrl);
      const ms = Date.now() - t0;
      if (dispatch.ok) {
        steps.push({
          index: steps.length,
          name: block.name,
          input: block.input,
          output: dispatch.output,
          ok: true,
          ms,
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
