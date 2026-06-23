import { NextResponse } from 'next/server';
import type { MotionProject } from '@/lib/motion/project';
import {
  buildMotionVisualSourcingPlan,
  type MotionVisualSourcingRequest,
} from '@/lib/motion/visualSourcingPlan';
import { buildMotionPreviewPlan } from '@/lib/motion/previewPlan';
import { buildMotionReviewPlan } from '@/lib/motion/reviewPlan';
import { listAvailableProviders as listImageProviders } from '@/lib/providers/image/registry';
import { listReferenceProviders } from '@/lib/providers/reference/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MotionVisualsRequestBody = Record<string, unknown>;

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionVisualsRequestBody;
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
  const draftId = stringValue(body.draftId);
  const plan = buildMotionVisualSourcingPlan(project, {
    draftId,
    requestedAt,
  });
  const selectedRequests = selectVisualRequests(plan.requests, body);

  if (!selectedRequests) {
    return jsonError(400, 'requestIds or kinds must reference visual sourcing requests in the plan');
  }

  return NextResponse.json({
    ok: true,
    status: plan.status === 'needs-story' ? 'blocked' : plan.status,
    project,
    visualSourcingPlan: plan,
    selectedRequests,
    blockers: plan.blockers,
    reviewPlan: buildMotionReviewPlan(project),
    previewPlan: buildMotionPreviewPlan(project, { requestedAt }),
    providers: {
      image: listImageProviders(),
      reference: listReferenceProviders().map((provider) => ({ id: provider.id })),
    },
  });
}

function selectVisualRequests(
  requests: MotionVisualSourcingRequest[],
  body: MotionVisualsRequestBody
): MotionVisualSourcingRequest[] | null {
  const requestIds = parseStringArray(body.requestIds);
  if (body.requestIds !== undefined && !requestIds) return null;

  if (requestIds) {
    return selectByValues(requests, requestIds, (request) => request.id);
  }

  const kinds = parseStringArray(body.kinds);
  if (body.kinds !== undefined && !kinds) return null;

  if (kinds) {
    return selectByValues(requests, kinds, (request) => request.kind);
  }

  return requests;
}

function selectByValues(
  requests: MotionVisualSourcingRequest[],
  values: string[],
  keyFor: (request: MotionVisualSourcingRequest) => string
): MotionVisualSourcingRequest[] | null {
  const selected = requests.filter((request) => values.includes(keyFor(request)));
  const selectedValues = new Set(selected.map(keyFor));
  return values.every((value) => selectedValues.has(value)) ? selected : null;
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
