import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { authorizeEventApiRequest } from '@/lib/research/event-recap/api-auth';
import {
  dispatchRecapRunAction,
  type DispatchAction,
} from '@/lib/research/event-recap/recap-run-dispatcher';
import type { RecapRunState } from '@/lib/research/event-recap/recap-run-state';

/**
 * GET  /api/events/:eventId/runs/:runId/junctures
 * POST /api/events/:eventId/runs/:runId/junctures
 *
 * REST surface for the recap run state machine. The POST body shape is
 * a DispatchAction (see lib/research/event-recap/recap-run-dispatcher.ts):
 *   { action: 'initialize', mode: 'auto'|'hitl' }
 *   { action: 'request', junctureId, evidence, actor? }
 *   { action: 'decide', junctureId, decision, rationale, actor }
 *   { action: 'auto-approve', junctureId, evidence, rationale? }
 *
 * The route is the boundary between HTTP and the pure state machine.
 * Convex storage is loaded once, mutated via dispatchRecapRunAction,
 * then persisted with the result. The dispatcher itself has no I/O.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const recapRunStateApi = (anyApi as unknown as {
  recapRunState: {
    getByRunId: unknown;
    initialize: unknown;
    updateState: unknown;
  };
}).recapRunState;

function convex(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

async function loadState(runId: string): Promise<RecapRunState | null> {
  const client = convex();
  if (!client) return null;
  const row = (await client.query(recapRunStateApi.getByRunId as never, { runId } as never)) as
    | { state: RecapRunState }
    | null;
  return row?.state ?? null;
}

async function persistInitial(eventId: string, runId: string, state: RecapRunState): Promise<void> {
  const client = convex();
  if (!client) return;
  await client.mutation(recapRunStateApi.initialize as never, {
    eventId,
    runId,
    mode: state.mode,
    state,
  } as never);
}

async function persistUpdate(runId: string, state: RecapRunState): Promise<void> {
  const client = convex();
  if (!client) return;
  await client.mutation(recapRunStateApi.updateState as never, {
    runId,
    state,
  } as never);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; runId: string }> }
) {
  const { eventId, runId } = await params;
  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/:eventId/runs/:runId/junctures',
    action: 'recap-run-state.get',
    metadata: { eventId, runId },
  });
  if (authResponse) return authResponse;

  const state = await loadState(runId);
  if (!state) {
    return NextResponse.json({ ok: false, error: 'run not initialized' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, state });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; runId: string }> }
) {
  const { eventId, runId } = await params;
  const body = (await request.json().catch(() => null)) as DispatchAction | null;
  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ ok: false, error: 'body must be a DispatchAction' }, { status: 400 });
  }

  const authResponse = await authorizeEventApiRequest(request, {
    route: '/api/events/:eventId/runs/:runId/junctures',
    action: `recap-run-state.${body.action}`,
    metadata: { eventId, runId, junctureId: 'junctureId' in body ? body.junctureId : undefined },
  });
  if (authResponse) return authResponse;

  const current = await loadState(runId);

  // Ensure initialize action carries the runId from the path so the body
  // can't smuggle a different runId.
  const action: DispatchAction =
    body.action === 'initialize'
      ? { ...body, eventId, runId, mode: body.mode }
      : body;

  const result = dispatchRecapRunAction(current, action);
  if (!result.ok || !result.state) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  if (body.action === 'initialize') {
    await persistInitial(eventId, runId, result.state);
  } else {
    await persistUpdate(runId, result.state);
  }

  return NextResponse.json({ ok: true, state: result.state });
}
