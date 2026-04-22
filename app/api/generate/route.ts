import { NextResponse } from 'next/server';
import { planGenerate, runGenerate } from '@/lib/agent/generate';
import { listAvailableProviders } from '@/lib/providers/image/registry';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';
import { recordRunFail, recordRunFinish, recordRunStart } from '@/lib/convex/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: listAvailableProviders(),
  });
}

export async function POST(request: Request) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[generate/${reqId}] POST received · ua=${request.headers.get('user-agent')?.slice(0, 40) ?? '?'}`);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.log(`[generate/${reqId}] rejected · invalid JSON`);
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ ok: false, error: 'body must be an object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt) {
    console.log(`[generate/${reqId}] rejected · empty prompt`);
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 });
  }
  const providerId = typeof b.providerId === 'string' ? b.providerId : undefined;
  const model = typeof b.model === 'string' ? b.model : undefined;
  const refs = Array.isArray(b.refs) ? (b.refs as Array<{ url: string; weight?: number }>) : undefined;
  const bypassAgent = b.bypassAgent === true;
  const planOnly = b.planOnly === true;
  const clientRunId = typeof b.runId === 'string' ? b.runId : undefined;
  // Optional per-request aspect ratio override used by the fan-out path.
  // Narrowed against the AspectRatio union; a bad value is treated as absent
  // (agent/bypass default takes over) rather than rejected at the edge.
  const ALLOWED_RATIOS = ['1:1', '9:16', '16:9', '4:3', '3:4', '4:5', '2:3', '3:2'] as const;
  const rawRatio = typeof b.aspectRatio === 'string' ? b.aspectRatio : undefined;
  const aspectRatioOverride =
    rawRatio && (ALLOWED_RATIOS as readonly string[]).includes(rawRatio)
      ? (rawRatio as (typeof ALLOWED_RATIOS)[number])
      : undefined;
  console.log(
    `[generate/${reqId}] running · provider=${providerId ?? 'auto'} model=${model ?? 'auto'} bypassAgent=${bypassAgent} planOnly=${planOnly} aspect=${aspectRatioOverride ?? 'auto'} promptLen=${prompt.length}`
  );

  if (clientRunId) {
    await recordRunStart({
      clientRunId,
      tool: 'image-gen',
      provider: providerId ?? 'auto',
      model: model ?? '',
      prompt,
    });
  }

  try {
    if (planOnly) {
      const outcome = await planGenerate({
        prompt,
        providerId,
        model,
        refs,
        bypassAgent,
        aspectRatioOverride,
      });
      console.log(
        `[generate/${reqId}] planned · provider=${outcome.provider.id} model=${outcome.provider.model} aspect=${outcome.plan.aspectRatio}`
      );
      return NextResponse.json({
        ok: true,
        plan: outcome.plan,
        provider: outcome.provider,
      });
    }

    const outcome = await runGenerate({
      prompt,
      providerId,
      model,
      refs,
      bypassAgent,
      aspectRatioOverride,
    });
    console.log(
      `[generate/${reqId}] ok · provider=${outcome.provider.id} model=${outcome.provider.model} latency=${outcome.result.latencyMs}ms images=${outcome.result.images.length}`
    );
    if (clientRunId) {
      await recordRunFinish(clientRunId, {
        status: 'ok',
        provider: outcome.provider.id,
        model: outcome.provider.model,
        rewrittenPrompt: outcome.plan?.rewrittenPrompt,
        rationale: outcome.plan?.rationale,
        aspectRatio: outcome.plan?.aspectRatio,
        imageUrl: outcome.result.images[0]?.url,
        latencyMs: outcome.result.latencyMs,
      });
    }
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
      console.log(`[generate/${reqId}] 503 · ${err.message}`);
      if (clientRunId) await recordRunFail(clientRunId, err.message, 503);
      return NextResponse.json({ ok: false, error: err.message, code: 'provider_unavailable' }, { status: 503 });
    }
    if (err instanceof ImageGenError) {
      console.log(`[generate/${reqId}] 502 · ${err.message}`);
      if (clientRunId) await recordRunFail(clientRunId, err.message, 502);
      return NextResponse.json({ ok: false, error: err.message, code: 'image_gen_failed' }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[generate/${reqId}] 500 · ${message}`, stack);
    if (clientRunId) await recordRunFail(clientRunId, message, 500);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
