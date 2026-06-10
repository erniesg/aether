import type {
  PresencePlannerContext,
  PresenceStrategyShape,
} from '@/lib/presence/types';

export const STRATEGY_REASONING_SHAPE = [
  'The reasoning shape a strategy must show:',
  '1. Reframe the goal as evidence, not audience.',
  '2. ICP in priority order, with a reason each.',
  '3. Positioning = intersection of two credible signals.',
  '4. Pillars map 1:1 to evidence.',
  '5. Mechanics are concrete numbers.',
  '6. A skip list.',
  "7. A 90-day success metric that isn't follower count.",
].join('\n');

export function buildPresenceStrategyPrompt(context: PresencePlannerContext): string {
  const lines = [
    'Create a proposed X presence strategy for this aether presence profile.',
    STRATEGY_REASONING_SHAPE,
    '',
    'Profile:',
    `- label: ${context.profile.label}`,
    `- handle: ${context.profile.xHandle}`,
    `- goal: ${context.profile.goal}`,
    context.profile.targetMetric
      ? `- target metric: ${context.profile.targetMetric}`
      : '- target metric: not specified',
    '',
    'Output requirements:',
    '- Return 5 to 12 ICP accounts. Every account needs a handle and a concrete reason.',
    '- Return 3 to 5 content pillars. Every pillar needs at least one evidenceRefs entry.',
    '- Include cadence, replyPlaybook, skipList, and goalMetric90d.',
    '- goalMetric90d must not be follower count.',
    '- Degrade gracefully when evidence is thin; name evidence gaps directly.',
  ];

  if (context.creatorContext) {
    const { brand, offer, campaign } = context.creatorContext;
    lines.push('', 'Creator context:');
    if (brand) {
      lines.push(
        `- Brand: ${brand.name}${brand.voice ? `; voice: ${brand.voice}` : ''}`
      );
    }
    if (offer) {
      const claims = offer.claims && offer.claims.length > 0
        ? `; claims: ${offer.claims.join(', ')}`
        : '';
      lines.push(
        `- Offer: ${offer.name}${offer.summary ? `; ${offer.summary}` : ''}${claims}`
      );
    }
    if (campaign) {
      lines.push(
        `- Campaign: ${campaign.name}${campaign.goal ? `; goal: ${campaign.goal}` : ''}${campaign.audience ? `; audience: ${campaign.audience}` : ''}`
      );
    }
  }

  if (context.evidenceFacts && context.evidenceFacts.length > 0) {
    lines.push('', 'Evidence facts:');
    for (const fact of context.evidenceFacts.slice(0, 24)) {
      lines.push(`- ${fact.source.kind}:${fact.source.ref} — ${fact.text}`);
    }
  }

  if (context.insightsDigest) {
    lines.push('', 'ICP insights digest:', stableJson(context.insightsDigest));
  }

  if (context.performanceLedger) {
    lines.push('', 'Own-handle performance ledger:', stableJson(context.performanceLedger));
  }

  return lines.join('\n');
}

export function coercePresenceStrategyShape(input: unknown): PresenceStrategyShape | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const positioning = stringField(value, 'positioning');
  const cadence = stringField(value, 'cadence');
  const goalMetric90d = stringField(value, 'goalMetric90d');
  const icpAccounts = arrayField(value, 'icpAccounts')
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const handle = stringField(record, 'handle');
      const reason = stringField(record, 'reason');
      return handle && reason ? { handle, reason } : null;
    })
    .filter((entry): entry is { handle: string; reason: string } => entry !== null);
  const pillars = arrayField(value, 'pillars')
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = stringField(record, 'name');
      const evidenceRefs = stringArray(record.evidenceRefs);
      const exampleFormats = stringArray(record.exampleFormats);
      return name && evidenceRefs.length > 0
        ? { name, evidenceRefs, exampleFormats }
        : null;
    })
    .filter(
      (entry): entry is { name: string; evidenceRefs: string[]; exampleFormats: string[] } =>
        entry !== null
    );
  const replyPlaybookInput = value.replyPlaybook;
  const replyPlaybook =
    replyPlaybookInput && typeof replyPlaybookInput === 'object'
      ? {
          dailyMinutes: numberField(replyPlaybookInput as Record<string, unknown>, 'dailyMinutes'),
          accountListSize: numberField(
            replyPlaybookInput as Record<string, unknown>,
            'accountListSize'
          ),
        }
      : null;
  const skipList = stringArray(value.skipList);

  if (
    !positioning ||
    icpAccounts.length < 5 ||
    pillars.length < 3 ||
    !cadence ||
    !replyPlaybook ||
    replyPlaybook.dailyMinutes <= 0 ||
    replyPlaybook.accountListSize <= 0 ||
    skipList.length === 0 ||
    !goalMetric90d ||
    /\bfollowers?\b/i.test(goalMetric90d)
  ) {
    return null;
  }

  return {
    positioning,
    icpAccounts,
    pillars: pillars.slice(0, 5),
    cadence,
    replyPlaybook,
    skipList,
    goalMetric90d,
  };
}

export function fallbackPresenceStrategy(context: PresencePlannerContext): PresenceStrategyShape {
  const ref = context.evidenceFacts?.[0]
    ? `${context.evidenceFacts[0].source.kind}:${context.evidenceFacts[0].source.ref}`
    : `profile:${context.profile.id}`;
  return {
    positioning: `${context.profile.label} builds from visible shipping evidence, not generic commentary.`,
    icpAccounts: [
      { handle: '@openai', reason: 'AI platform builders reward credible build receipts' },
      { handle: '@AnthropicAI', reason: 'agent reliability and workflow audience' },
      { handle: '@modal_labs', reason: 'deployment-minded AI engineers' },
      { handle: '@vercel', reason: 'DX builders amplify practical demos' },
      { handle: '@convex_dev', reason: 'reactive product builders match the stack evidence' },
    ],
    pillars: [
      {
        name: 'shipping receipts',
        evidenceRefs: [ref],
        exampleFormats: ['failure-honest thread'],
      },
      {
        name: 'visible demos',
        evidenceRefs: [ref],
        exampleFormats: ['demo video post'],
      },
      {
        name: 'production rigor',
        evidenceRefs: [ref],
        exampleFormats: ['earned opinion'],
      },
    ],
    cadence: '2 posts/week · 15 min replies/day',
    replyPlaybook: { dailyMinutes: 15, accountListSize: 25 },
    skipList: ['model hot takes', 'generic listicles', 'engagement bait'],
    goalMetric90d:
      '5 replies or DMs from named lab/tooling engineers referencing specific posts',
  };
}

function stringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(input: Record<string, unknown>, field: string): number {
  const value = input[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function arrayField(input: Record<string, unknown>, field: string): unknown[] {
  const value = input[field];
  return Array.isArray(value) ? value : [];
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
    : [];
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(flattenKeys(value)).sort(), 2);
}

function flattenKeys(value: unknown, keys: Record<string, true> = {}): Record<string, true> {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys[key] = true;
      flattenKeys(child, keys);
    }
  }
  return keys;
}
