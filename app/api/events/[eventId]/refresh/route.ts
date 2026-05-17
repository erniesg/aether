import { NextResponse } from 'next/server';
import { refreshEventRecap } from '@/lib/research/event-recap/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const input = isObject(body) ? body : {};

  try {
    const bundle = await refreshEventRecap({
      eventId,
      name: typeof input.name === 'string' ? input.name : undefined,
      contextHint:
        typeof input.contextHint === 'string' ? input.contextHint : undefined,
      liveMode: input.liveMode === 'tinyfish' ? 'tinyfish' : undefined,
      maxItemsPerPlatform:
        typeof input.maxItemsPerPlatform === 'number'
          ? input.maxItemsPerPlatform
          : undefined,
      monthlyCreditBudget:
        typeof input.monthlyCreditBudget === 'number'
          ? input.monthlyCreditBudget
          : undefined,
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
