import { NextResponse } from 'next/server';
import { warmLinkedInSessionViaTinyFish } from '@/lib/research/event-recap/tinyfish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!isObject(body)) {
    return NextResponse.json({ ok: false, error: 'JSON object body is required' }, { status: 400 });
  }

  try {
    const session = await warmLinkedInSessionViaTinyFish({
      holdMinutes: typeof body.holdMinutes === 'number' ? body.holdMinutes : undefined,
      pollSeconds: typeof body.pollSeconds === 'number' ? body.pollSeconds : undefined,
      targetUrl: typeof body.targetUrl === 'string' ? body.targetUrl : undefined,
      syncVault: typeof body.syncVault === 'boolean' ? body.syncVault : undefined,
    });
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
