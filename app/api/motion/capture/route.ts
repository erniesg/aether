import path from 'node:path';
import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import { applyCaptureResultToMotionProject } from '@/lib/motion/captureApply';
import {
  buildAgentMotionCapturePlan,
  type AgentMotionCapturePlanRequest,
} from '@/lib/motion/capturePlan';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import type { CaptureProvider, CaptureResult } from '@/lib/providers/capture/types';
import type { CaptureAppLaunch } from '@/lib/providers/capture/types';
import { createLocalAppLauncher } from '@/lib/providers/capture/local-app-launch';
import { createPlaywrightBrowserCaptureProvider } from '@/lib/providers/capture/playwright';
import {
  CaptureProviderUnavailableError,
  listCaptureProviders,
  resolveCaptureProvider,
} from '@/lib/providers/capture/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionCaptureRequestBody = Record<string, unknown>;

interface MotionCaptureRunnerSummary {
  kind: 'playwright-local';
  providerId: string;
  outputDir: string;
  launchLocalApp: boolean;
  headless: boolean;
  timeoutMs?: number;
}

interface InlineCaptureRunner {
  provider: CaptureProvider;
  summary: MotionCaptureRunnerSummary;
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionCaptureRequestBody;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) return jsonError(400, 'body must be a JSON object');
    body = parsed;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }

  if (!isObject(body.project)) {
    return jsonError(400, 'project is required');
  }

  const project = body.project as unknown as MotionProject;
  const requestedAt = numericValue(body.requestedAt) ?? Date.now();
  const updatedAt = numericValue(body.updatedAt);
  const capturePlan = buildAgentMotionCapturePlan(project);

  if (capturePlan.status === 'not-needed') {
    return NextResponse.json({
      ok: true,
      status: 'not-needed',
      project,
      capturePlan,
      selectedRequests: [],
      appLaunches: [],
      captureResults: [],
      captureResult: null,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
      providers: listCaptureProviders(),
    });
  }

  if (capturePlan.status !== 'ready') {
    return NextResponse.json({
      ok: true,
      status: 'blocked',
      project,
      capturePlan,
      selectedRequests: [],
      appLaunches: [],
      blockers: [
        {
          id: 'capture-source-required',
          label: 'Add a site/app URL before capture',
        },
      ],
      captureResults: [],
      captureResult: null,
      reviewPlan: buildMotionReviewPlan(project),
      previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
      providers: listCaptureProviders(),
    });
  }

  const selectedRequests = selectCaptureRequests(capturePlan.requests, body);
  if (!selectedRequests) {
    return jsonError(400, 'requestIds must reference capture requests in the plan');
  }
  if (selectedRequests.length === 0) {
    return jsonError(400, 'no capture requests selected');
  }
  const appLaunches = selectedAppLaunches(selectedRequests);
  let inlineRunner: InlineCaptureRunner | undefined;

  try {
    inlineRunner = buildInlineCaptureRunner(body.captureRunner, project);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message);
  }

  if (inlineRunner && stringValue(body.providerId)) {
    return jsonError(400, 'providerId cannot be combined with captureRunner');
  }
  const providerInventory = captureProviderInventory(inlineRunner?.provider);

  try {
    const provider = inlineRunner?.provider ?? resolveCaptureProvider(stringValue(body.providerId));
    const captureResults = await Promise.all(
      selectedRequests.map((planRequest) =>
        provider.capture({
          ...planRequest.request,
          preferredProviderId: provider.id,
        })
      )
    );
    const captureResult = mergeCaptureResults(provider.id, captureResults);
    const updatedProject = applyCaptureResultToMotionProject(project, captureResult, {
      updatedAt,
    });

    return NextResponse.json({
      ok: true,
      status: 'captured',
      project: updatedProject,
      capturePlan: buildAgentMotionCapturePlan(updatedProject),
      selectedRequests,
      appLaunches,
      captureResults,
      captureResult,
      reviewPlan: buildMotionReviewPlan(updatedProject),
      previewPlan: buildMotionPreviewPlan(updatedProject, {
        requestedAt,
        providerSetup: { capture: providerInventory },
      }),
      providers: providerInventory,
      captureRunner: inlineRunner?.summary ?? null,
    });
  } catch (error) {
    if (error instanceof CaptureProviderUnavailableError) {
      return NextResponse.json({
        ok: true,
        status: 'provider-required',
        project,
        capturePlan,
        selectedRequests,
        appLaunches,
        blockers: [
          {
            id: 'capture-provider-required',
            label: error.message,
          },
        ],
        captureResults: [],
        captureResult: null,
        reviewPlan: buildMotionReviewPlan(project),
        previewPlan: buildMotionPreviewPlan(project, {
          requestedAt,
          providerSetup: { capture: providerInventory },
        }),
        providers: providerInventory,
        captureRunner: inlineRunner?.summary ?? null,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonError(502, message, { code: 'motion_capture_failed' });
  }
}

function selectedAppLaunches(
  selectedRequests: AgentMotionCapturePlanRequest[]
): CaptureAppLaunch[] {
  const launches = selectedRequests.flatMap((request) =>
    request.request.appLaunch ? [request.request.appLaunch] : []
  );
  const seen = new Set<string>();
  return launches.filter((launch) => {
    const key = `${launch.command}:${launch.cwd ?? ''}:${launch.targetUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildInlineCaptureRunner(
  value: unknown,
  project: MotionProject
): InlineCaptureRunner | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('captureRunner must be a JSON object');

  const kind = stringValue(value.kind);
  if (kind !== 'playwright-local') {
    throw new Error('captureRunner.kind must be playwright-local');
  }

  const timeoutMs = optionalPositiveNumber(value.timeoutMs, 'captureRunner.timeoutMs');
  const headless = booleanValue(value.headless) ?? true;
  const launchLocalApp = booleanValue(value.launchLocalApp) ?? false;
  const outputDir = resolveCaptureOutputDir(project, value.outputDir);
  const provider = createPlaywrightBrowserCaptureProvider({
    outputDir,
    headless,
    timeoutMs,
    launchApp: launchLocalApp ? createLocalAppLauncher() : undefined,
  });

  return {
    provider,
    summary: {
      kind,
      providerId: provider.id,
      outputDir,
      launchLocalApp,
      headless,
      ...(timeoutMs ? { timeoutMs } : {}),
    },
  };
}

function resolveCaptureOutputDir(project: MotionProject, value: unknown): string {
  const requested = stringValue(value);
  const root = process.cwd();

  if (!requested) {
    return path.join(root, 'outputs', 'motion-captures', slugify(project.id));
  }

  if (path.isAbsolute(requested)) {
    throw new Error('captureRunner.outputDir must be relative to the aether workspace');
  }

  const resolved = path.resolve(root, requested);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('captureRunner.outputDir must stay inside the aether workspace');
  }

  return resolved;
}

function captureProviderInventory(inlineProvider?: CaptureProvider): Array<{
  id: string;
  displayName: string;
  available: boolean;
}> {
  const providers = listCaptureProviders();
  if (!inlineProvider) return providers;

  const inlineSummary = {
    id: inlineProvider.id,
    displayName: inlineProvider.displayName,
    available: inlineProvider.available(),
  };

  return [inlineSummary, ...providers.filter((provider) => provider.id !== inlineProvider.id)];
}

function selectCaptureRequests(
  requests: AgentMotionCapturePlanRequest[],
  body: MotionCaptureRequestBody
): AgentMotionCapturePlanRequest[] | null {
  const requestIds = parseStringArray(body.requestIds);
  if (body.requestIds !== undefined && !requestIds) return null;

  if (requestIds) {
    const requestsById = new Map(requests.map((request) => [request.id, request]));
    const selected = requestIds.flatMap((id) => {
      const request = requestsById.get(id);
      return request ? [request] : [];
    });
    return selected.length === requestIds.length ? selected : null;
  }

  const includeOptional = body.includeOptional === true;
  return requests.filter((request) => request.required || includeOptional);
}

function mergeCaptureResults(providerId: string, results: CaptureResult[]): CaptureResult {
  return {
    providerId,
    artifacts: results.flatMap((result) => result.artifacts),
    provenance: uniqueProvenance(results.flatMap((result) => result.provenance)),
  };
}

function parseStringArray(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const values = value.flatMap((candidate) => {
    const parsed = stringValue(candidate);
    return parsed ? [parsed] : [];
  });
  return values.length === value.length ? values : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = numericValue(value);
  if (!parsed || parsed <= 0) throw new Error(`${label} must be a positive number`);
  return parsed;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function slugify(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function uniqueProvenance(refs: CaptureResult['provenance']): CaptureResult['provenance'] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
