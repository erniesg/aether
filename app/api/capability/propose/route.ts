import { NextResponse } from 'next/server';
import { proposeCapabilityFromRun } from '@/lib/agent/proposeCapability';
import type { CapabilityRunRecord } from '@/lib/store/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/capability/propose
 * body: { run: CapabilityRunRecord, bypassAgent?: boolean }
 * Returns { ok: true, proposal: { name, trigger, paramSchema, notes? } }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, error: 'body must be an object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const run = b.run as CapabilityRunRecord | undefined;
  if (!run || typeof run !== 'object' || typeof run.prompt !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'run record with prompt is required' },
      { status: 400 }
    );
  }
  const bypassAgent = b.bypassAgent === true;

  try {
    const proposal = await proposeCapabilityFromRun(run, { bypassAgent });
    return NextResponse.json({ ok: true, proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
