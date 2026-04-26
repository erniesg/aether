import { NextResponse } from 'next/server';
import { ingestReferenceUrl } from '@/lib/providers/reference/registry';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import {
  normalizeResearchPlatforms,
  planResearch,
  recordFromResearchTarget,
  type ResearchPlan,
  type ResearchRequest,
  type ResearchTarget,
} from '@/lib/research/research';
import { searchSignalReferencesForTarget } from '@/lib/research/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface ResearchResponse {
  ok: boolean;
  plan?: ResearchPlan;
  records?: ReferenceRecord[];
  scrapedCount?: number;
  signalCount?: number;
  materializedCount?: number;
  debug?: {
    warnings: string[];
  };
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
  target: ResearchTarget
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
 * Direct URLs go through the existing public OG scrape adapters. Social search
 * targets try configured signal APIs first, then degrade to source-linked
 * research artifacts so creators can still cluster and moodboard.
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

  const debugMode = new URL(request.url).searchParams.get('debug') === '1';
  const plan = planResearch(normalized);
  const records: ReferenceRecord[] = [];
  const seenRecords = new Set<string>();
  const debugWarnings: string[] = [];
  let scrapedCount = 0;
  let signalCount = 0;
  let signalTargetsTried = 0;
  let materializedCount = 0;

  const pushRecord = (record: ReferenceRecord) => {
    const key = record.fullUrl ?? record.previewUrl;
    if (seenRecords.has(key)) return false;
    seenRecords.add(key);
    records.push(record);
    return true;
  };

  for (const [index, target] of plan.targets.entries()) {
    if (target.kind === 'url') {
      try {
        const outcome = await ingestReferenceUrl(target.sourceUrl);
        pushRecord(withResearchDefaults(outcome.record, target));
        scrapedCount += 1;
        continue;
      } catch (err) {
        if (debugMode) {
          debugWarnings.push(
            `${target.label}: ${err instanceof Error ? err.message : 'source scrape failed'}`
          );
        }
        // Keep the source in the research set even when the public URL scrape
        // fails; the creator can still inspect or remove it in the rail.
      }
    }

    if (signalTargetsTried < 4) {
      const signalOutcome = await searchSignalReferencesForTarget(target, {
        limit: 3,
      });
      if (signalOutcome.tried) signalTargetsTried += 1;
      if (debugMode && signalOutcome.warnings.length > 0) {
        debugWarnings.push(
          ...signalOutcome.warnings.map((warning) => `${target.label}: ${warning}`)
        );
      }
      if (signalOutcome.records.length > 0) {
        for (const record of signalOutcome.records) {
          if (pushRecord(withResearchDefaults(record, target))) signalCount += 1;
        }
        continue;
      }
    }

    pushRecord(recordFromResearchTarget(target, index));
    materializedCount += 1;
  }

  return NextResponse.json({
    ok: true,
    plan,
    records,
    scrapedCount,
    signalCount,
    materializedCount,
    debug: debugMode ? { warnings: debugWarnings } : undefined,
  } satisfies ResearchResponse);
}
