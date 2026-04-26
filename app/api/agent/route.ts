import { NextResponse } from 'next/server';
import { runMultiAgent } from '@/lib/agent/multi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface RequestBody {
  prompt?: string;
  maxIterations?: number;
  wsId?: string;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'request body must be JSON' }, { status: 400 });
  }
  if (!body.prompt || typeof body.prompt !== 'string') {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  try {
    const result = await runMultiAgent({
      prompt: body.prompt,
      baseUrl,
      maxIterations: body.maxIterations,
      wsId: typeof body.wsId === 'string' ? body.wsId : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
