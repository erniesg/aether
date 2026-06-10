import { getXWeightedLength } from '@/lib/publish/x-intent';
import type {
  GeneratedPresenceDraft,
  PresenceDraftReceipt,
  PresencePlannerContext,
  PresenceStrategyShape,
} from './types';

export const DRAFT_SHAPE_RULES = [
  'Draft shape rules:',
  'Every generated draft follows: hook with the outcome -> one real number -> one honest failure -> artifact link.',
  'Numbers are never invented; use [N] placeholders when the receipt lacks the figure.',
  'Every draft must carry a receipt ref.',
  'Never transition a generated draft to posted.',
].join('\n');

export interface RejectedPresenceDraft {
  draft: unknown;
  reason: 'pillar-not-in-strategy' | 'missing-receipt' | 'over-weight' | 'invalid-shape';
}

export function buildPresenceDraftPrompt(
  context: PresencePlannerContext & { strategy: PresenceStrategyShape }
): string {
  const lines = [
    'Generate X post and reply drafts for this accepted presence strategy.',
    DRAFT_SHAPE_RULES,
    '',
    'Profile:',
    `- label: ${context.profile.label}`,
    `- handle: ${context.profile.xHandle}`,
    `- goal: ${context.profile.goal}`,
    '',
    'Strategy pillars:',
    ...context.strategy.pillars.map(
      (pillar) =>
        `- ${pillar.name}; evidence: ${pillar.evidenceRefs.join(', ')}; formats: ${pillar.exampleFormats.join(', ')}`
    ),
    '',
    `Positioning: ${context.strategy.positioning}`,
    `Cadence: ${context.strategy.cadence}`,
    `Skip: ${context.strategy.skipList.join(', ')}`,
  ];

  if (context.evidenceFacts && context.evidenceFacts.length > 0) {
    lines.push('', 'Evidence facts:');
    for (const fact of context.evidenceFacts.slice(0, 30)) {
      lines.push(`- ${fact.source.kind}:${fact.source.ref} - ${fact.text}`);
    }
  }

  if (context.insightsDigest) {
    lines.push('', 'ICP insights digest:', JSON.stringify(context.insightsDigest, null, 2));
  }
  if (context.performanceLedger) {
    lines.push('', 'Own-handle performance ledger:', JSON.stringify(context.performanceLedger, null, 2));
  }
  if (context.recentIcpPosts && context.recentIcpPosts.length > 0) {
    lines.push('', 'Recent ICP posts:', JSON.stringify(context.recentIcpPosts.slice(0, 20), null, 2));
  }

  return lines.join('\n');
}

export function validateGeneratedPresenceDrafts(
  rawDrafts: unknown[],
  strategy: PresenceStrategyShape
): { drafts: GeneratedPresenceDraft[]; rejected: RejectedPresenceDraft[] } {
  const allowedPillars = new Set(strategy.pillars.map((pillar) => pillar.name));
  const drafts: GeneratedPresenceDraft[] = [];
  const rejected: RejectedPresenceDraft[] = [];

  for (const raw of rawDrafts) {
    const draft = coerceGeneratedDraft(raw);
    if (!draft) {
      rejected.push({ draft: raw, reason: 'invalid-shape' });
      continue;
    }
    if (!allowedPillars.has(draft.pillar)) {
      rejected.push({ draft, reason: 'pillar-not-in-strategy' });
      continue;
    }
    if (!draft.receipt.ref.trim()) {
      rejected.push({ draft, reason: 'missing-receipt' });
      continue;
    }
    if (getXWeightedLength(draft.text) > 280) {
      rejected.push({ draft, reason: 'over-weight' });
      continue;
    }
    drafts.push(draft);
  }

  return { drafts, rejected };
}

export function fallbackPresenceDrafts(
  context: PresencePlannerContext & { strategy: PresenceStrategyShape }
): GeneratedPresenceDraft[] {
  const receipt = fallbackReceipt(context);
  return context.strategy.pillars.slice(0, 3).map((pillar) => ({
    kind: 'post',
    pillar: pillar.name,
    text: `I shipped ${pillar.name} with [N] concrete receipts. The useful part was the failure mode, not the victory lap. Artifact: ${receipt.ref}`,
    receipt,
  }));
}

function coerceGeneratedDraft(input: unknown): GeneratedPresenceDraft | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const kind = value.kind === 'reply' ? 'reply' : value.kind === 'post' ? 'post' : null;
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  const pillar = typeof value.pillar === 'string' ? value.pillar.trim() : '';
  const targetUrl = typeof value.targetUrl === 'string' && value.targetUrl.trim()
    ? value.targetUrl.trim()
    : undefined;
  const receipt = coerceReceipt(value.receipt);
  if (!kind || !text || !pillar || !receipt) return null;
  return { kind, text, pillar, ...(targetUrl ? { targetUrl } : {}), receipt };
}

function coerceReceipt(input: unknown): PresenceDraftReceipt | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const kind =
    value.kind === 'evidence-fact' || value.kind === 'signal-post'
      ? value.kind
      : null;
  const ref = typeof value.ref === 'string' ? value.ref.trim() : '';
  return kind && ref ? { kind, ref } : null;
}

function fallbackReceipt(context: PresencePlannerContext): PresenceDraftReceipt {
  const fact = context.evidenceFacts?.[0];
  if (fact) {
    return {
      kind: 'evidence-fact',
      ref: `${fact.source.kind}:${fact.source.ref}`,
    };
  }
  return { kind: 'evidence-fact', ref: `profile:${context.profile.id}` };
}
