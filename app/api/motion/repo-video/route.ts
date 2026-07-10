import { NextResponse } from 'next/server';
import { POST as agentHandoffPOST } from '@/app/api/motion/agent-handoff/route';
import { POST as motionStartPOST } from '@/app/api/motion/start/route';
import { createGitHubGhCodeChangeProvider } from '@/lib/providers/code-change/github-gh';
import {
  listCodeChangeProviders,
  registerCodeChangeProvider,
} from '@/lib/providers/code-change/registry';
import { registerVoiceProvider } from '@/lib/providers/voice/registry';
import type { VoiceProvider, VoiceSynthesisRequest } from '@/lib/providers/voice/types';
import {
  DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID,
  DRAFT_RENDER_PROVIDER_ID,
  DRAFT_VOICE_PROVIDER_ID,
} from '@/lib/motion/repoVideoProviderIds';
import { createDraftMotionRenderProvider } from '@/lib/providers/video/draft-render';
import { registerMotionImageToVideoProvider } from '@/lib/providers/video/generation-registry';
import { registerMotionRenderProvider } from '@/lib/providers/video/render-registry';
import type {
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
} from '@/lib/providers/video/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RepoVideoRequestBody = Record<string, unknown>;

const DEFAULT_FULL_AUTO_TEMPLATE_IDS = [
  'setup-local-app',
  'setup-visual-source',
  'setup-visual-generation',
  'setup-voice',
  'setup-render',
  'full-auto-run',
];

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: RepoVideoRequestBody;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) return jsonError(400, 'body must be a JSON object');
    body = parsed;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }

  const unregisterCodeChangeProvider = registerLocalGitHubProviderWhenNeeded(body);
  let startResponse: Response;
  try {
    startResponse = await motionStartPOST(
      new Request('http://localhost/api/motion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  } finally {
    unregisterCodeChangeProvider();
  }
  const start = await startResponse.json();
  if (!startResponse.ok || start.ok === false) {
    return NextResponse.json(start, { status: startResponse.status });
  }

  const shouldRunFullAuto = body.runFullAuto !== false && body.mode === 'full-auto';
  if (!shouldRunFullAuto || !isObject(start.project) || !isObject(start.agentHandoff)) {
    return NextResponse.json({
      ok: true,
      status: start.status,
      project: start.project ?? null,
      start,
      run: null,
    });
  }

  const templateIds = parseTemplateIds(body.templateIds, start.agentHandoff);
  if (!templateIds) {
    return jsonError(400, 'templateIds must be a non-empty string array');
  }

  const unregisterDraftProviders = registerDraftProvidersForMissingInputs(body);
  let handoffResponse: Response;
  let run: Record<string, unknown>;
  try {
    handoffResponse = await agentHandoffPOST(
      new Request('http://localhost/api/motion/agent-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handoff: start.agentHandoff,
          project: start.project,
          templateIds,
          input: handoffInput(body),
        }),
      })
    );
    run = await handoffResponse.json();
  } finally {
    unregisterDraftProviders();
  }
  if (!handoffResponse.ok || run.ok === false) {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        error: run.error ?? `motion repo-video run failed: ${handoffResponse.status}`,
        start,
        run,
      },
      { status: handoffResponse.status }
    );
  }

  return NextResponse.json({
    ok: true,
    status: run.status,
    project: run.finalProject ?? start.project,
    start,
    run,
  });
}

function registerLocalGitHubProviderWhenNeeded(body: RepoVideoRequestBody): () => void {
  const hasPullRequestSource =
    typeof body.prRef === 'string' ||
    (Array.isArray(body.sourceRefs) &&
      body.sourceRefs.some(
        (source) => isObject(source) && source.kind === 'pr' && typeof source.ref === 'string'
      ));
  if (!hasPullRequestSource) return () => undefined;
  if (listCodeChangeProviders().some((provider) => provider.available)) {
    return () => undefined;
  }

  return registerCodeChangeProvider('github-gh', () =>
    createGitHubGhCodeChangeProvider()
  );
}

function parseTemplateIds(value: unknown, handoff: Record<string, unknown>): string[] | null {
  if (Array.isArray(value)) {
    const templateIds = value.filter(
      (templateId): templateId is string =>
        typeof templateId === 'string' && templateId.trim().length > 0
    );
    return templateIds.length === value.length && templateIds.length > 0 ? templateIds : null;
  }

  const templates = Array.isArray(handoff.templates)
    ? handoff.templates.filter(isObject)
    : [];
  const availableTemplateIds = new Set(
    templates.flatMap((template) => {
      const id = stringValue(template.id);
      return id ? [id] : [];
    })
  );
  const templateIds = DEFAULT_FULL_AUTO_TEMPLATE_IDS.filter((id) =>
    availableTemplateIds.has(id)
  );
  return templateIds.length > 0 ? templateIds : null;
}

function handoffInput(body: RepoVideoRequestBody): Record<string, unknown> {
  const explicitInput = isObject(body.input) ? body.input : {};
  return {
    ...explicitInput,
    imageToVideoProviderId: stringValue(
      explicitInput.imageToVideoProviderId ??
        body.imageToVideoProviderId ??
        DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID
    ),
    voiceProviderId: stringValue(
      explicitInput.voiceProviderId ?? body.voiceProviderId ?? DRAFT_VOICE_PROVIDER_ID
    ),
    renderProviderId: stringValue(
      explicitInput.renderProviderId ?? body.renderProviderId ?? DRAFT_RENDER_PROVIDER_ID
    ),
    sourceAuthorProviderId: stringValue(
      explicitInput.sourceAuthorProviderId ?? body.sourceAuthorProviderId
    ),
    computerUseCaptureRunner:
      explicitInput.computerUseCaptureRunner ?? body.computerUseCaptureRunner,
  };
}

function registerDraftProvidersForMissingInputs(body: RepoVideoRequestBody): () => void {
  const explicitInput = isObject(body.input) ? body.input : {};
  const unregister: Array<() => void> = [];

  if (!stringValue(explicitInput.imageToVideoProviderId ?? body.imageToVideoProviderId)) {
    unregister.push(
      registerMotionImageToVideoProvider(DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID, () =>
        draftImageToVideoProvider()
      )
    );
  }
  if (!stringValue(explicitInput.voiceProviderId ?? body.voiceProviderId)) {
    unregister.push(
      registerVoiceProvider(DRAFT_VOICE_PROVIDER_ID, () => draftVoiceProvider())
    );
  }
  if (!stringValue(explicitInput.renderProviderId ?? body.renderProviderId)) {
    unregister.push(
      registerMotionRenderProvider(DRAFT_RENDER_PROVIDER_ID, () =>
        createDraftMotionRenderProvider()
      )
    );
  }

  return () => {
    while (unregister.length > 0) unregister.pop()?.();
  };
}

function draftImageToVideoProvider(): MotionImageToVideoProvider {
  return {
    id: DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID,
    displayName: 'Aether draft image-to-video',
    available: () => true,
    async generate(request: MotionImageToVideoRequest) {
      return {
        providerId: DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID,
        artifacts: [
          {
            ...request.output,
            requestId: request.id,
            assetUrl:
              request.source.assetUrl ??
              `asset://draft-image-to-video/${request.projectId}/${request.clipId}.mp4`,
            durationMs: Math.round((request.durationFrames / request.fps) * 1000),
            provenance: [
              { kind: 'provider', ref: DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID },
              ...request.output.provenance,
            ],
          },
        ],
        provenance: [{ kind: 'provider', ref: DRAFT_IMAGE_TO_VIDEO_PROVIDER_ID }],
      };
    },
  };
}

function draftVoiceProvider(): VoiceProvider {
  return {
    id: DRAFT_VOICE_PROVIDER_ID,
    displayName: 'Aether draft voice',
    available: () => true,
    async synthesize(request: VoiceSynthesisRequest) {
      return {
        providerId: DRAFT_VOICE_PROVIDER_ID,
        artifacts: request.expectedArtifacts.map((artifact) => ({
          ...artifact,
          assetUrl: `asset://draft-voice/${request.projectId}/${artifact.path}`,
          ...(artifact.kind === 'audio'
            ? { durationMs: Math.round((request.durationFrames / request.fps) * 1000) }
            : {}),
          provenance: [
            { kind: 'provider', ref: DRAFT_VOICE_PROVIDER_ID },
            ...artifact.provenance,
          ],
        })),
        provenance: [{ kind: 'provider', ref: DRAFT_VOICE_PROVIDER_ID }],
      };
    },
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
