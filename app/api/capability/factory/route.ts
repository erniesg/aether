import { NextResponse } from 'next/server';
import {
  planCapabilityFactoryAction,
  type CapabilityPublishScope,
} from '@/lib/capability/factory';
import { resolveCapabilityFactoryRegistry } from '@/lib/capability/factoryRegistry';
import { createCapabilityAuthoringIssue } from '@/lib/capability/authoringIssue';
import { listSpatialProviders } from '@/lib/providers/spatial/registry';
import type { SpatialProviderStatus } from '@/lib/providers/spatial/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FactoryBody {
  prompt?: string;
  artifactKind?: string;
  publishScope?: CapabilityPublishScope;
  sourceMode?: 'selected-image';
}

function resolveSpatialFormat(prompt: string): 'particle-field' | 'gaussian-splat' {
  return /\b(particle field|particles?)\b/i.test(prompt) ? 'particle-field' : 'gaussian-splat';
}

function resolveSpatialName(prompt: string): string {
  return resolveSpatialFormat(prompt) === 'particle-field' ? 'particle field' : 'gaussian splat';
}

function pickSpatialProvider(
  statuses: SpatialProviderStatus[]
): { providerId: 'draft' | 'replicate-splat' | 'modal-splat'; model: string } {
  const envDefault = process.env.SPATIAL_PROVIDER;
  const byId = new Map(statuses.map((s) => [s.id, s]));

  const tryId = (id: string | undefined) => {
    if (!id) return null;
    const entry = byId.get(id as SpatialProviderStatus['id']);
    if (!entry || !entry.available) return null;
    return {
      providerId: entry.id as 'draft' | 'replicate-splat' | 'modal-splat',
      model: entry.models[0] ?? entry.id,
    };
  };

  return (
    tryId(envDefault) ??
    tryId('replicate-splat') ??
    tryId('modal-splat') ??
    tryId('draft') ?? {
      providerId: 'draft',
      model: 'particle-field-v1',
    }
  );
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

  const b = body as FactoryBody;
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  const artifactKind = typeof b.artifactKind === 'string' ? b.artifactKind.trim() : '';
  const publishScope: CapabilityPublishScope = b.publishScope === 'team' ? 'team' : 'workspace';

  if (!prompt || !artifactKind) {
    return NextResponse.json(
      { ok: false, error: 'prompt and artifactKind are required' },
      { status: 400 }
    );
  }

  const registry = resolveCapabilityFactoryRegistry(artifactKind);
  const plan = planCapabilityFactoryAction(
    {
      prompt,
      artifactKind,
      publishScope,
    },
    registry.snapshot
  );

  let issue:
    | {
        number: number;
        url: string;
        title: string;
        labels: string[];
        repo: string;
      }
    | undefined;

  if (plan.humanReviewRequired) {
    issue = await createCapabilityAuthoringIssue({
      prompt,
      artifactKind,
      publishScope,
      requestedAction: plan.action,
      reason: plan.reason,
      sourceMode: b.sourceMode,
    });
  }

  const response: Record<string, unknown> = {
    ok: true,
    plan,
  };
  if (issue) {
    response.issue = issue;
  }

  if (artifactKind === 'spatial' && registry.draftTool?.id === 'spatial-gen') {
    const format = resolveSpatialFormat(prompt);
    const name = resolveSpatialName(prompt);
    const providers = listSpatialProviders();
    const picked = pickSpatialProvider(providers);

    response.draftInvocation = {
      toolId: 'spatial-gen',
      providerId: picked.providerId,
      model: picked.model,
      format,
      quality: 'draft',
    };
    response.draftCapability = {
      name,
      trigger: prompt,
      notes: issue
        ? `Draft capability auto-added while publication is pending in #${issue.number}.`
        : 'Draft capability auto-added while publication is pending.',
      tool: 'spatial-gen',
      provider: picked.providerId,
      entryRef: {
        kind: 'tool',
        id: 'spatial-gen',
        version: 1,
      },
      runTemplate: {
        prompt,
        artifactKind: 'spatial',
        format,
        quality: 'draft',
        sourceMode: 'selected-image',
        providerId: picked.providerId,
        model: picked.model,
      },
    };
    response.spatialProviders = providers;
  }

  if (issue) {
    response.creatorMessage = `Requested a reusable capability build in issue #${issue.number}.`;
  }

  return NextResponse.json(response);
}
