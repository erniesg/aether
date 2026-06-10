import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import {
  isEvidenceClaim,
  loadWorkspaceEvidenceFacts,
} from '@/lib/presence/evidence';
import { normalizeXHandle } from '@/lib/presence/handle';
import {
  buildPresenceStrategyPrompt,
  coercePresenceStrategyShape,
  fallbackPresenceStrategy,
} from '@/lib/presence/strategy';
import type { PresencePlannerContext, PresenceProfile } from '@/lib/presence/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-4-7';

const presenceApi = (anyApi as unknown as {
  presence: { upsertStrategyProposal: unknown };
}).presence;

const TOOL_EMIT_STRATEGY: Anthropic.Messages.Tool = {
  name: 'emit_presence_strategy',
  description: 'Return one proposed presence strategy for the requested profile.',
  input_schema: {
    type: 'object',
    properties: {
      strategy: {
        type: 'object',
        properties: {
          positioning: { type: 'string' },
          icpAccounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                handle: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['handle', 'reason'],
            },
          },
          pillars: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                evidenceRefs: { type: 'array', items: { type: 'string' } },
                exampleFormats: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'evidenceRefs', 'exampleFormats'],
            },
          },
          cadence: { type: 'string' },
          replyPlaybook: {
            type: 'object',
            properties: {
              dailyMinutes: { type: 'number' },
              accountListSize: { type: 'number' },
            },
            required: ['dailyMinutes', 'accountListSize'],
          },
          skipList: { type: 'array', items: { type: 'string' } },
          goalMetric90d: { type: 'string' },
        },
        required: [
          'positioning',
          'icpAccounts',
          'pillars',
          'cadence',
          'replyPlaybook',
          'skipList',
          'goalMetric90d',
        ],
      },
    },
    required: ['strategy'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const parsed = parseBody(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const context: PresencePlannerContext = {
    ...parsed.context,
    evidenceFacts: await loadWorkspaceEvidenceFacts(
      parsed.context.workspaceId,
      parsed.context.evidenceFacts
    ),
  };
  const prompt = buildPresenceStrategyPrompt(context);
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    const strategy = fallbackPresenceStrategy(context);
    const proposalId = await persistStrategyProposal(context, strategy);
    return NextResponse.json({
      ok: true,
      status: 'proposed',
      fallback: 'no-api-key',
      profile: context.profile,
      strategy,
      ...(proposalId ? { proposalId } : {}),
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: 'text',
          text: 'You are aether, a creator-first canvas tool. Propose strategy only; do not create a dashboard or run history.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [TOOL_EMIT_STRATEGY],
      tool_choice: { type: 'tool', name: 'emit_presence_strategy' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });
    const tool = msg.content.find(isToolUseBlock);
    const strategy = coercePresenceStrategyShape(
      tool && tool.name === 'emit_presence_strategy'
        ? (tool.input as { strategy?: unknown }).strategy
        : null
    );
    if (!strategy) {
      return jsonError(502, 'strategy planner returned an invalid strategy shape');
    }
    const proposalId = await persistStrategyProposal(context, strategy);
    return NextResponse.json({
      ok: true,
      status: 'proposed',
      profile: context.profile,
      strategy,
      ...(proposalId ? { proposalId } : {}),
    });
  } catch (error) {
    const strategy = fallbackPresenceStrategy(context);
    const proposalId = await persistStrategyProposal(context, strategy);
    return NextResponse.json({
      ok: true,
      status: 'proposed',
      fallback: 'anthropic-error',
      profile: context.profile,
      strategy,
      ...(proposalId ? { proposalId } : {}),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseBody(body: unknown):
  | { ok: true; context: PresencePlannerContext }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;
  const workspaceId = typeof record.workspaceId === 'string' && record.workspaceId.trim()
    ? record.workspaceId.trim()
    : 'demo-ws';
  const profile = coerceProfile(record.profile, workspaceId);
  if (!profile) {
    return {
      ok: false,
      error: 'profile must include id, label, xHandle, and goal',
    };
  }
  const evidenceFacts = Array.isArray(record.evidenceFacts)
    ? record.evidenceFacts.filter(isEvidenceClaim)
    : undefined;
  return {
    ok: true,
    context: {
      workspaceId,
      profile,
      evidenceFacts,
      creatorContext: coerceCreatorContext(record.creatorContext),
      insightsDigest: record.insightsDigest,
      performanceLedger: record.performanceLedger,
    },
  };
}

function coerceProfile(input: unknown, workspaceId: string): PresenceProfile | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const id = stringField(record, 'id');
  const label = stringField(record, 'label');
  const xHandle = normalizeXHandle(stringField(record, 'xHandle'));
  const goal = stringField(record, 'goal');
  if (!id || !label || !xHandle || !goal) return null;
  const now = Date.now();
  return {
    id,
    workspaceId,
    label,
    xHandle,
    goal,
    targetMetric: stringField(record, 'targetMetric') || undefined,
    createdAt: numberField(record, 'createdAt') || now,
    updatedAt: numberField(record, 'updatedAt') || now,
  };
}

function isToolUseBlock(
  block: Anthropic.Messages.ContentBlock
): block is Anthropic.Messages.ToolUseBlock {
  return block.type === 'tool_use';
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function stringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(input: Record<string, unknown>, field: string): number {
  const value = input[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function coerceCreatorContext(input: unknown): PresencePlannerContext['creatorContext'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const brand = compactObject(record.brand);
  const offer = compactObject(record.offer);
  const campaign = compactObject(record.campaign);
  const out: NonNullable<PresencePlannerContext['creatorContext']> = {};
  if (brand) {
    const name = stringField(brand, 'name');
    if (name) out.brand = { name, voice: stringField(brand, 'voice') || undefined };
  }
  if (offer) {
    const name = stringField(offer, 'name');
    if (name) {
      out.offer = {
        name,
        summary: stringField(offer, 'summary') || undefined,
        claims: stringArray(offer.claims),
      };
    }
  }
  if (campaign) {
    const name = stringField(campaign, 'name');
    if (name) {
      out.campaign = {
        name,
        goal: stringField(campaign, 'goal') || undefined,
        audience: stringField(campaign, 'audience') || undefined,
      };
    }
  }
  return out.brand || out.offer || out.campaign ? out : undefined;
}

function compactObject(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
}

async function persistStrategyProposal(
  context: PresencePlannerContext,
  strategy: ReturnType<typeof fallbackPresenceStrategy>
): Promise<string | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') adminClient.setAdminAuth(deployKey);
  }
  return (await client.mutation(presenceApi.upsertStrategyProposal as never, {
    workspaceId: context.workspaceId,
    profileId: context.profile.id,
    strategy,
  } as never)) as string;
}
