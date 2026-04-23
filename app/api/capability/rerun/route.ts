import { NextResponse } from 'next/server';
import { runGenerate } from '@/lib/agent/generate';
import { ImageGenError, ProviderUnavailableError } from '@/lib/providers/image/types';
import {
  resolveCapabilityDefinitionEntryRef,
  type CapabilityDefinitionRecord,
} from '@/lib/capability/types';
import { recordRunFail, recordRunFinish, recordRunStart } from '@/lib/convex/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RerunBody {
  definition: CapabilityDefinitionRecord;
  targetLayerId?: string;
  promptOverride?: string;
  bypassAgent?: boolean;
  runId?: string;
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
  const runId = typeof b.runId === 'string' && b.runId.trim() ? b.runId.trim() : undefined;
  const providerId = def.runTemplate.providerId;
  const model = def.runTemplate.model;
  const entryRef = resolveCapabilityDefinitionEntryRef(def);

  if (def.tool !== 'image-gen') {
    return NextResponse.json(
      { ok: false, error: `capability rerun for '${def.tool}' is not implemented yet` },
      { status: 501 }
    );
  }

  if (runId) {
    await recordRunStart({
      clientRunId: runId,
      tool: def.tool,
      provider: providerId ?? def.provider,
      model: model ?? '',
      prompt,
      aspectRatio: def.runTemplate.aspectRatio,
      definitionId: def.id,
      definitionVersion: def.version,
      entryRef,
    });
  }

  try {
    const outcome = await runGenerate({ prompt, providerId, model, bypassAgent });
    const first = outcome.result.images[0];
    if (runId) {
      await recordRunFinish(runId, {
        provider: outcome.provider.id,
        model: outcome.provider.model,
        rewrittenPrompt: outcome.plan.rewrittenPrompt,
        rationale: outcome.plan.rationale,
        aspectRatio: outcome.plan.aspectRatio,
        imageUrl: first?.url,
        latencyMs: outcome.result.latencyMs,
      });
    }
    return NextResponse.json({
      ok: true,
      definitionId: def.id,
      definitionVersion: def.version,
      entryRef,
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
      if (runId) await recordRunFail(runId, err.message, 503);
      return NextResponse.json(
        { ok: false, error: err.message, code: 'provider_unavailable' },
        { status: 503 }
      );
    }
    if (err instanceof ImageGenError) {
      if (runId) await recordRunFail(runId, err.message, 502);
      return NextResponse.json(
        { ok: false, error: err.message, code: 'image_gen_failed' },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (runId) await recordRunFail(runId, message, 500);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
