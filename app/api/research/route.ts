import { NextResponse } from 'next/server';
import { ingestReferenceUrl } from '@/lib/providers/reference/registry';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import {
  normalizeResearchPlatforms,
  planResearch,
  recordFromResearchTarget,
  type ResearchPlan,
  type ResearchRequest,
} from '@/lib/research/research';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface ResearchResponse {
  ok: boolean;
  plan?: ResearchPlan;
  records?: ReferenceRecord[];
  scrapedCount?: number;
  materializedCount?: number;
  error?: string;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeRequest(body: unknown): ResearchRequest | null {
  if (!isObject(body)) return null;
  return {
    context: isObject(body.context)
      ? (body.context as ResearchRequest['context'])
      : undefined,
    seedText: typeof body.seedText === 'string' ? body.seedText : undefined,
    platforms: Array.isArray(body.platforms)
      ? normalizeResearchPlatforms(body.platforms)
      : undefined,
    limit: typeof body.limit === 'number' ? body.limit : undefined,
  };
}

function withResearchDefaults(
  record: ReferenceRecord,
  target: NonNullable<ResearchPlan['targets'][number]>
): ReferenceRecord {
  return {
    ...record,
    title: record.title ?? target.label,
    usageIntent: record.usageIntent ?? 'visual anchor',
    tags: Array.from(new Set([...(record.tags ?? []), ...target.tags])),
    notes: record.notes ?? `${target.reason}; ${target.kind} ${target.value}`,
  };
}

/**
 * POST /api/research
 *
 * Accepts creator context plus optional seed text, decomposes it into URL,
 * keyword, hashtag, and account targets, then returns materialized references.
 * Direct URLs go through the existing public OG scrape adapters. Non-URL
 * targets become source-linked research artifacts so creators can cluster and
 * moodboard before external discovery connectors are provisioned.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  const normalized = normalizeRequest(body);
  if (!normalized) return jsonError(400, 'body must be an object');

  const plan = planResearch(normalized);
  const records: ReferenceRecord[] = [];
  let scrapedCount = 0;
  let materializedCount = 0;

  for (const [index, target] of plan.targets.entries()) {
    if (target.kind === 'url') {
      try {
        const outcome = await ingestReferenceUrl(target.sourceUrl);
        records.push(withResearchDefaults(outcome.record, target));
        scrapedCount += 1;
        continue;
      } catch {
        // Keep the source in the research set even when the public URL scrape
        // fails; the creator can still inspect or remove it in the rail.
      }
    }
    records.push(recordFromResearchTarget(target, index));
    materializedCount += 1;
  }

  return NextResponse.json({
    ok: true,
    plan,
    records,
    scrapedCount,
    materializedCount,
  } satisfies ResearchResponse);
}
