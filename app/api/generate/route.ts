import { NextResponse } from 'next/server';
import { runGenerate } from '@/lib/agent/generate';
import { listAvailableProviders } from '@/lib/providers/image/registry';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listAvailableProviders(),
  });
}

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
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
  }
  const providerId = typeof b.providerId === 'string' ? b.providerId : undefined;
  const model = typeof b.model === 'string' ? b.model : undefined;
  const refs = Array.isArray(b.refs) ? (b.refs as Array<{ url: string; weight?: number }>) : undefined;
  const bypassAgent = b.bypassAgent === true;

  try {
    const outcome = await runGenerate({ prompt, providerId, model, refs, bypassAgent });
    return NextResponse.json({
      ok: true,
      plan: outcome.plan,
      provider: outcome.provider,
      result: {
        latencyMs: outcome.result.latencyMs,
        images: outcome.result.images.map((img) => ({
          url: img.url,
          width: img.width,
          height: img.height,
          mimeType: img.mimeType,
        })),
      },
    });
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return NextResponse.json({ ok: false, error: err.message, code: 'provider_unavailable' }, { status: 503 });
    }
    if (err instanceof ImageGenError) {
      return NextResponse.json({ ok: false, error: err.message, code: 'image_gen_failed' }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
