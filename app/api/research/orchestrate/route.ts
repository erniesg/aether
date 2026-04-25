import { NextResponse } from 'next/server';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import type { CreatorContextModel } from '@/lib/context/model';
import { orchestrateResearch } from '@/lib/research/orchestrator';

// All aether API routes use Node.js runtime so opennextjs-cloudflare
// can bundle them into a single Worker without per-route splitting.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * POST /api/research/orchestrate
 *
 * Accepts { seedText, creatorContext?, refs? } and fans three subagents out
 * (researcher + clusterer + aesthetic-analyzer) via orchestrateResearch.
 *
 * Falls back to single-pass planResearch when refs.length < MIN_REFS_FOR_MULTI_AGENT.
 *
 * The existing /api/research route (single-pass) is untouched.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }

  if (!isObject(body)) {
    return jsonError(400, 'body must be a JSON object');
  }

  const { seedText, creatorContext, refs } = body as {
    seedText?: unknown;
    creatorContext?: unknown;
    refs?: unknown;
  };

  if (!seedText || typeof seedText !== 'string' || seedText.trim() === '') {
    return jsonError(400, 'seedText is required and must be a non-empty string');
  }

  try {
    const snapshot = await orchestrateResearch({
      seedText: seedText.trim(),
      creatorContext: isObject(creatorContext)
        ? (creatorContext as Partial<CreatorContextModel>)
        : undefined,
      refs: Array.isArray(refs) ? (refs as ReferenceRecord[]) : [],
    });

    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, code: 'orchestrate_failed', error: message },
      { status: 400 }
    );
  }
}
