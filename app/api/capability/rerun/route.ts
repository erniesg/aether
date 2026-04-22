import { NextResponse } from 'next/server';
import { runGenerate } from '@/lib/agent/generate';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';
import type { CapabilityDefinitionRecord } from '@/lib/capability/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RerunBody {
  definition: CapabilityDefinitionRecord;
  targetLayerId?: string;
  promptOverride?: string;
  bypassAgent?: boolean;
}

/**
 * POST /api/capability/rerun
 * body: { definition, targetLayerId?, promptOverride?, bypassAgent? }
 *
 * Routes to the same image-gen path as /api/generate, but carries the
 * originating definitionId through so the resulting run is provenance-linked.
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
  const b = body as RerunBody;
  const def = b.definition;
  if (!def || typeof def !== 'object' || typeof def.id !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'capability definition is required' },
      { status: 400 }
    );
  }
  const prompt = (b.promptOverride ?? def.runTemplate.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: 'definition has no prompt in runTemplate; promptOverride required' },
      { status: 400 }
    );
  }
  const bypassAgent = b.bypassAgent === true;
  const providerId = def.runTemplate.providerId;
  const model = def.runTemplate.model;

  try {
    const outcome = await runGenerate({ prompt, providerId, model, bypassAgent });
    return NextResponse.json({
      ok: true,
      definitionId: def.id,
      targetLayerId: b.targetLayerId,
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
      return NextResponse.json(
        { ok: false, error: err.message, code: 'provider_unavailable' },
        { status: 503 }
      );
    }
    if (err instanceof ImageGenError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: 'image_gen_failed' },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
