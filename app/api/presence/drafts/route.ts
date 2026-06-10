import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import {
  buildPresenceDraftPrompt,
  fallbackPresenceDrafts,
  validateGeneratedPresenceDrafts,
} from '@/lib/presence/drafts';
import {
  isEvidenceClaim,
  loadWorkspaceEvidenceFacts,
} from '@/lib/presence/evidence';
import { normalizeXHandle } from '@/lib/presence/handle';
import { coercePresenceStrategyShape } from '@/lib/presence/strategy';
import type {
  GeneratedPresenceDraft,
  PresencePlannerContext,
  PresenceProfile,
  PresenceStrategyShape,
} from '@/lib/presence/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-opus-4-7';

const publishDraftsApi = (anyApi as unknown as {
  publishDrafts: { addGeneratedBatch: unknown };
}).publishDrafts;

const TOOL_EMIT_DRAFTS: Anthropic.Messages.Tool = {
  name: 'emit_presence_drafts',
  description: 'Return receipt-grounded X post and reply drafts.',
  input_schema: {
    type: 'object',
    properties: {
      drafts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['post', 'reply'] },
            text: { type: 'string' },
            pillar: { type: 'string' },
            targetUrl: { type: 'string' },
            receipt: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['evidence-fact', 'signal-post'] },
                ref: { type: 'string' },
              },
              required: ['kind', 'ref'],
            },
          },
          required: ['kind', 'text', 'pillar', 'receipt'],
        },
      },
    },
    required: ['drafts'],
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
  const { strategy, lapId } = parsed;
  const context: PresencePlannerContext = {
    ...parsed.context,
    evidenceFacts: await loadWorkspaceEvidenceFacts(
      parsed.context.workspaceId,
      parsed.context.evidenceFacts
    ),
  };
  const prompt = buildPresenceDraftPrompt({ ...context, strategy });
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  try {
    const rawDrafts = apiKey
      ? await planDraftsWithClaude(apiKey, prompt)
      : fallbackPresenceDrafts({ ...context, strategy });
    const validation = validateGeneratedPresenceDrafts(rawDrafts, strategy);
    const persistence = await persistDrafts({
      workspaceId: context.workspaceId,
      profileId: context.profile.id,
      lapId,
      drafts: validation.drafts,
    });
    return NextResponse.json({
      ok: true,
      lapId,
      drafts: validation.drafts,
      rejected: validation.rejected,
      ...(apiKey ? {} : { fallback: 'no-api-key' }),
      ...(persistence ? { persistence } : {}),
    });
  } catch (error) {
    const validation = validateGeneratedPresenceDrafts(
      fallbackPresenceDrafts({ ...context, strategy }),
      strategy
    );
    const persistence = await persistDrafts({
      workspaceId: context.workspaceId,
      profileId: context.profile.id,
      lapId,
      drafts: validation.drafts,
    });
    return NextResponse.json({
      ok: true,
      lapId,
      fallback: 'anthropic-error',
      drafts: validation.drafts,
      rejected: validation.rejected,
      ...(persistence ? { persistence } : {}),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function planDraftsWithClaude(
  apiKey: string,
  prompt: string
): Promise<unknown[]> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2400,
    system: [
      {
        type: 'text',
        text: 'You are aether. Generate editable drafts only; never post and never invent numbers.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [TOOL_EMIT_DRAFTS],
    tool_choice: { type: 'tool', name: 'emit_presence_drafts' },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  });
  const tool = msg.content.find(isToolUseBlock);
  if (!tool || tool.name !== 'emit_presence_drafts') {
    throw new Error('draft planner did not emit drafts');
  }
  const drafts = (tool.input as { drafts?: unknown }).drafts;
  return Array.isArray(drafts) ? drafts : [];
}

function parseBody(body: unknown):
  | {
      ok: true;
      context: PresencePlannerContext;
      strategy: PresenceStrategyShape;
      lapId: string;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }
  const record = body as Record<string, unknown>;
  const workspaceId = stringField(record, 'workspaceId') || 'demo-ws';
  const profile = coerceProfile(record.profile, workspaceId);
  if (!profile) return { ok: false, error: 'profile is required' };
  const strategy = coercePresenceStrategyShape(record.strategy);
  if (!strategy) return { ok: false, error: 'accepted strategy is required' };
  const evidenceFacts = Array.isArray(record.evidenceFacts)
    ? record.evidenceFacts.filter(isEvidenceClaim)
    : undefined;
  const lapId =
    stringField(record, 'lapId') || `presence_${profile.id}_${Date.now().toString(36)}`;
  return {
    ok: true,
    lapId,
    context: {
      workspaceId,
      profile,
      evidenceFacts,
      insightsDigest: record.insightsDigest,
      performanceLedger: record.performanceLedger,
      recentIcpPosts: Array.isArray(record.recentIcpPosts)
        ? record.recentIcpPosts
        : undefined,
    },
    strategy,
  };
}

async function persistDrafts(input: {
  workspaceId: string;
  profileId: string;
  lapId: string;
  drafts: GeneratedPresenceDraft[];
}): Promise<{ created: number; skipped: number } | null> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl || input.drafts.length === 0) return null;
  const client = new ConvexHttpClient(convexUrl);
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (deployKey) {
    const adminClient = client as unknown as { setAdminAuth?: (key: string) => void };
    if (typeof adminClient.setAdminAuth === 'function') adminClient.setAdminAuth(deployKey);
  }
  return (await client.mutation(publishDraftsApi.addGeneratedBatch as never, {
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    lapId: input.lapId,
    drafts: input.drafts.map((draft) => ({
      kind: draft.kind,
      text: draft.text,
      pillar: draft.pillar,
      targetUrl: draft.targetUrl,
      status: 'draft',
      receiptKind: draft.receipt.kind,
      receiptRef: draft.receipt.ref,
    })),
  } as never)) as { created: number; skipped: number };
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
