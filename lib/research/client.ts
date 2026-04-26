'use client';

import type { ReferenceRecord } from '@/lib/providers/reference/types';
import type { ResearchPlan, ResearchRequest } from './research';

export interface ResearchClientResponse {
  ok: boolean;
  plan: ResearchPlan;
  records: ReferenceRecord[];
  scrapedCount: number;
  signalCount: number;
  materializedCount: number;
}

export async function runResearchViaApi(
  request: ResearchRequest
): Promise<ResearchClientResponse> {
  const res = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const json = (await res.json()) as Partial<ResearchClientResponse> & {
    error?: string;
  };
  if (!res.ok || !json.ok || !json.plan || !Array.isArray(json.records)) {
    throw new Error(json.error ?? `research failed: ${res.status}`);
  }
  return {
    ok: true,
    plan: json.plan,
    records: json.records,
    scrapedCount: json.scrapedCount ?? 0,
    signalCount: json.signalCount ?? 0,
    materializedCount: json.materializedCount ?? 0,
  };
}
