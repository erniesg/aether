import { NextResponse } from 'next/server';
import type { WorkflowEngine, WorkflowSourceKind } from '@/lib/workflow/registry';
import type {
  AppProfile,
  MotionPlatformTarget,
  MotionProvenanceRef,
} from '@/lib/motion/project';
import type { MotionWorkflowIntent } from '@/lib/motion/workflowRouter';
import type { MotionWorkflowPlanSourceRef } from '@/lib/motion/workflowPlan';
import { startAgentMotionWorkflow } from '@/lib/motion/start';
import type {
  CodeChangeCiStatus,
  CodeChangeFileStatus,
  CodeChangeResult,
  CodeChangeReviewState,
  CodeChangeSource,
  CodeChangeSourceKind,
} from '@/lib/providers/code-change/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MotionStartRequestBody = Record<string, unknown>;

const VALID_SOURCE_KINDS = new Set<WorkflowSourceKind>([
  'repo',
  'pr',
  'site',
  'capture',
  'upload',
  'reference',
  'remotion',
  'hyperframes',
]);
const VALID_INTENTS = new Set<MotionWorkflowIntent>([
  'launch',
  'feature',
  'demo',
  'social',
  'pr',
  'website',
  'caption-overlay',
  'motion-graphic',
  'port',
]);
const VALID_ENGINES = new Set<WorkflowEngine>(['remotion', 'hyperframes', 'provider']);
const VALID_PLATFORMS = new Set(['x', 'linkedin', 'youtube', 'tiktok', 'instagram', 'website', 'deck']);
const VALID_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:5']);
const VALID_CODE_CHANGE_SOURCE_KINDS = new Set<CodeChangeSourceKind>([
  'github-pr',
  'local-diff',
  'commit-range',
]);
const VALID_CODE_CHANGE_FILE_STATUSES = new Set<CodeChangeFileStatus>([
  'added',
  'modified',
  'removed',
  'renamed',
]);
const VALID_CODE_CHANGE_REVIEW_STATES = new Set<CodeChangeReviewState>([
  'approved',
  'changes-requested',
  'commented',
]);
const VALID_CODE_CHANGE_CI_STATUSES = new Set<CodeChangeCiStatus>([
  'passed',
  'failed',
  'pending',
  'unknown',
]);
const VALID_PROVENANCE_KINDS = new Set<MotionProvenanceRef['kind']>([
  'repo',
  'code-change',
  'site',
  'upload',
  'reference',
  'story-beat',
  'timeline',
  'capture',
  'voice',
  'visual-source',
  'image-to-video',
  'provider',
  'revision',
  'render',
  'manual',
]);

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request): Promise<Response> {
  let body: MotionStartRequestBody;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) return jsonError(400, 'body must be a JSON object');
    body = parsed;
  } catch {
    return jsonError(400, 'request body must be JSON');
  }

  const workspaceId = stringValue(body.workspaceId);
  if (!workspaceId) return jsonError(400, 'workspaceId is required');

  const sourceRefs = parseSourceRefs(body);
  if (sourceRefs.length === 0) {
    return jsonError(400, 'Add a repoPath, repoUrl, siteUrl, prRef, or sourceRefs entry');
  }

  const mode = parseMode(body.mode);
  if (!mode) return jsonError(400, 'mode must be review or full-auto');

  const intent = parseIntent(body.intent);
  if (body.intent !== undefined && !intent) return jsonError(400, 'intent is not supported');

  const platformTargets = parsePlatformTargets(body.platformTargets);
  if (!platformTargets) {
    return jsonError(400, 'platformTargets must contain supported platform, aspectRatio, and seconds');
  }

  const requestedEngines = parseRequestedEngines(body.requestedEngines);
  if (body.requestedEngines !== undefined && !requestedEngines) {
    return jsonError(400, 'requestedEngines must contain remotion, hyperframes, or provider');
  }

  const appProfile = parseAppProfile(body.appProfile);
  if (body.appProfile !== undefined && !appProfile) {
    return jsonError(400, 'appProfile must include name, summary, and stack');
  }

  const codeChangeSource = parseCodeChangeSource(body.codeChangeSource);
  if (body.codeChangeSource !== undefined && !codeChangeSource) {
    return jsonError(400, 'codeChangeSource must include supported kind and ref');
  }

  const codeChange = parseCodeChangeResult(body.codeChange);
  if (body.codeChange !== undefined && !codeChange) {
    return jsonError(400, 'codeChange must include title, files, hunks, commits, reviews, ci, and provenance');
  }

  try {
    const result = await startAgentMotionWorkflow(
      {
        id: stringValue(body.id) ?? defaultMotionId(sourceRefs, numericValue(body.createdAt)),
        workspaceId,
        intent,
        mode,
        sourceRefs,
        audience: stringValue(body.audience) ?? 'builders and creators',
        tone: stringValue(body.tone) ?? 'clear, visual, product-led',
        platformTargets,
        requestedEngines: requestedEngines ?? undefined,
        createdAt: numericValue(body.createdAt) ?? Date.now(),
        appProfile: appProfile ?? undefined,
        codeChangeSource: codeChangeSource ?? undefined,
        codeChange: codeChange ?? undefined,
      },
      {
        cwd: stringValue(body.cwd),
        maxFiles: numericValue(body.maxFiles),
      }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(400, message, { code: 'motion_start_failed' });
  }
}

function parseSourceRefs(body: MotionStartRequestBody): MotionWorkflowPlanSourceRef[] {
  const refs: MotionWorkflowPlanSourceRef[] = [];
  const rawRefs = body.sourceRefs;
  if (Array.isArray(rawRefs)) {
    for (const candidate of rawRefs) {
      if (!isObject(candidate)) continue;
      const kind = stringValue(candidate.kind);
      const ref = stringValue(candidate.ref);
      if (!kind || !ref || !VALID_SOURCE_KINDS.has(kind as WorkflowSourceKind)) continue;
      refs.push({
        kind: kind as WorkflowSourceKind,
        ref,
        label: stringValue(candidate.label),
      });
    }
  }

  pushShorthandSource(refs, 'repo', body.repoPath, 'Local repo');
  pushShorthandSource(refs, 'repo', body.repoUrl, 'Repo');
  pushShorthandSource(refs, 'site', body.siteUrl, 'Site');
  pushShorthandSource(refs, 'pr', body.prRef, 'Pull request');

  return dedupeSources(refs);
}

function pushShorthandSource(
  refs: MotionWorkflowPlanSourceRef[],
  kind: WorkflowSourceKind,
  value: unknown,
  label: string
): void {
  const ref = stringValue(value);
  if (!ref) return;
  refs.push({ kind, ref, label });
}

function parseMode(value: unknown): 'review' | 'full-auto' | null {
  if (value === undefined) return 'review';
  return value === 'review' || value === 'full-auto' ? value : null;
}

function parseIntent(value: unknown): MotionWorkflowIntent | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && VALID_INTENTS.has(value as MotionWorkflowIntent)) {
    return value as MotionWorkflowIntent;
  }
  return undefined;
}

function parseRequestedEngines(value: unknown): WorkflowEngine[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const engines = value.filter(
    (engine): engine is WorkflowEngine =>
      typeof engine === 'string' && VALID_ENGINES.has(engine as WorkflowEngine)
  );
  return engines.length === value.length ? engines : null;
}

function parsePlatformTargets(value: unknown): MotionPlatformTarget[] | null {
  if (value === undefined) {
    return [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }];
  }
  if (!Array.isArray(value) || value.length === 0) return null;

  const targets = value.flatMap((candidate): MotionPlatformTarget[] => {
    if (!isObject(candidate)) return [];
    const platform = stringValue(candidate.platform);
    const aspectRatio = stringValue(candidate.aspectRatio);
    const seconds = numericValue(candidate.seconds);
    if (
      !platform ||
      !aspectRatio ||
      !VALID_PLATFORMS.has(platform) ||
      !VALID_ASPECT_RATIOS.has(aspectRatio) ||
      !seconds ||
      seconds <= 0
    ) {
      return [];
    }

    return [
      {
        platform: platform as MotionPlatformTarget['platform'],
        aspectRatio: aspectRatio as MotionPlatformTarget['aspectRatio'],
        seconds,
      },
    ];
  });

  return targets.length === value.length ? targets : null;
}

function parseAppProfile(value: unknown): AppProfile | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;

  const name = stringValue(value.name);
  const summary = stringValue(value.summary);
  const stack = parseStringArray(value.stack);
  if (!name || !summary || !stack) return null;

  return {
    name,
    summary,
    stack,
    ...(stringValue(value.repoUrl) ? { repoUrl: stringValue(value.repoUrl) } : {}),
    ...(stringValue(value.siteUrl) ? { siteUrl: stringValue(value.siteUrl) } : {}),
  };
}

function parseCodeChangeSource(value: unknown): CodeChangeSource | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;

  const kind = stringValue(value.kind);
  const ref = stringValue(value.ref);
  if (!kind || !ref || !VALID_CODE_CHANGE_SOURCE_KINDS.has(kind as CodeChangeSourceKind)) {
    return null;
  }

  return { kind: kind as CodeChangeSourceKind, ref };
}

function parseCodeChangeResult(value: unknown): CodeChangeResult | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;

  const providerId = stringValue(value.providerId);
  const title = stringValue(value.title);
  const author = parseCodeChangeAuthor(value.author);
  const files = parseCodeChangeFiles(value.files);
  const hunks = parseCodeChangeHunks(value.hunks);
  const commits = parseCodeChangeCommits(value.commits);
  const reviews = parseCodeChangeReviews(value.reviews);
  const ci = parseCodeChangeCi(value.ci);
  const provenance = parseProvenanceRefs(value.provenance);

  if (
    !providerId ||
    !title ||
    author === null ||
    !files ||
    !hunks ||
    !commits ||
    !reviews ||
    !ci ||
    !provenance
  ) {
    return null;
  }

  return {
    providerId,
    title,
    ...(author ? { author } : {}),
    files,
    hunks,
    commits,
    reviews,
    ci,
    provenance,
  };
}

function parseCodeChangeAuthor(value: unknown): CodeChangeResult['author'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;

  const name = stringValue(value.name);
  if (!name) return null;

  return {
    name,
    ...(stringValue(value.avatarUrl) ? { avatarUrl: stringValue(value.avatarUrl) } : {}),
  };
}

function parseCodeChangeFiles(value: unknown): CodeChangeResult['files'] | null {
  if (!Array.isArray(value)) return null;

  const files = value.flatMap((candidate): CodeChangeResult['files'] => {
    if (!isObject(candidate)) return [];

    const path = stringValue(candidate.path);
    const status = stringValue(candidate.status);
    const additions = nonNegativeNumberValue(candidate.additions);
    const deletions = nonNegativeNumberValue(candidate.deletions);
    if (
      !path ||
      !status ||
      !VALID_CODE_CHANGE_FILE_STATUSES.has(status as CodeChangeFileStatus) ||
      additions === undefined ||
      deletions === undefined
    ) {
      return [];
    }

    return [
      {
        path,
        status: status as CodeChangeFileStatus,
        additions,
        deletions,
        ...(stringValue(candidate.language) ? { language: stringValue(candidate.language) } : {}),
      },
    ];
  });

  return files.length === value.length ? files : null;
}

function parseCodeChangeHunks(value: unknown): CodeChangeResult['hunks'] | null {
  if (!Array.isArray(value)) return null;

  const hunks = value.flatMap((candidate): CodeChangeResult['hunks'] => {
    if (!isObject(candidate)) return [];

    const id = stringValue(candidate.id);
    const filePath = stringValue(candidate.filePath);
    const lines = parseStringArray(candidate.lines);
    const provenance = parseProvenanceRefs(candidate.provenance);
    const oldStart = optionalNonNegativeNumberValue(candidate.oldStart);
    const newStart = optionalNonNegativeNumberValue(candidate.newStart);
    if (
      !id ||
      !filePath ||
      !lines ||
      !provenance ||
      oldStart === null ||
      newStart === null
    ) {
      return [];
    }

    return [
      {
        id,
        filePath,
        ...(oldStart !== undefined ? { oldStart } : {}),
        ...(newStart !== undefined ? { newStart } : {}),
        lines,
        provenance,
      },
    ];
  });

  return hunks.length === value.length ? hunks : null;
}

function parseCodeChangeCommits(value: unknown): CodeChangeResult['commits'] | null {
  if (!Array.isArray(value)) return null;

  const commits = value.flatMap((candidate): CodeChangeResult['commits'] => {
    if (!isObject(candidate)) return [];

    const sha = stringValue(candidate.sha);
    const message = stringValue(candidate.message);
    if (!sha || !message) return [];

    return [
      {
        sha,
        message,
        ...(stringValue(candidate.authorName) ? { authorName: stringValue(candidate.authorName) } : {}),
      },
    ];
  });

  return commits.length === value.length ? commits : null;
}

function parseCodeChangeReviews(value: unknown): CodeChangeResult['reviews'] | null {
  if (!Array.isArray(value)) return null;

  const reviews = value.flatMap((candidate): CodeChangeResult['reviews'] => {
    if (!isObject(candidate)) return [];

    const reviewer = stringValue(candidate.reviewer);
    const state = stringValue(candidate.state);
    if (
      !reviewer ||
      !state ||
      !VALID_CODE_CHANGE_REVIEW_STATES.has(state as CodeChangeReviewState)
    ) {
      return [];
    }

    return [{ reviewer, state: state as CodeChangeReviewState }];
  });

  return reviews.length === value.length ? reviews : null;
}

function parseCodeChangeCi(value: unknown): CodeChangeResult['ci'] | null {
  if (!Array.isArray(value)) return null;

  const ci = value.flatMap((candidate): CodeChangeResult['ci'] => {
    if (!isObject(candidate)) return [];

    const name = stringValue(candidate.name);
    const status = stringValue(candidate.status);
    if (!name || !status || !VALID_CODE_CHANGE_CI_STATUSES.has(status as CodeChangeCiStatus)) {
      return [];
    }

    return [
      {
        name,
        status: status as CodeChangeCiStatus,
        ...(stringValue(candidate.url) ? { url: stringValue(candidate.url) } : {}),
      },
    ];
  });

  return ci.length === value.length ? ci : null;
}

function parseProvenanceRefs(value: unknown): MotionProvenanceRef[] | null {
  if (!Array.isArray(value)) return null;

  const refs = value.flatMap((candidate): MotionProvenanceRef[] => {
    if (!isObject(candidate)) return [];

    const kind = stringValue(candidate.kind);
    const ref = stringValue(candidate.ref);
    if (!kind || !ref || !VALID_PROVENANCE_KINDS.has(kind as MotionProvenanceRef['kind'])) {
      return [];
    }

    return [
      {
        kind: kind as MotionProvenanceRef['kind'],
        ref,
        ...(stringValue(candidate.label) ? { label: stringValue(candidate.label) } : {}),
      },
    ];
  });

  return refs.length === value.length ? refs : null;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.flatMap((item): string[] => {
    const parsed = stringValue(item);
    return parsed ? [parsed] : [];
  });
  return values.length === value.length ? values : null;
}

function defaultMotionId(
  sourceRefs: MotionWorkflowPlanSourceRef[],
  createdAt: number | undefined
): string {
  const source = sourceRefs[0];
  const sourceSlug = slugify(source?.ref ?? 'source');
  return `motion-${source?.kind ?? 'source'}-${sourceSlug}-${createdAt ?? Date.now()}`;
}

function dedupeSources(sourceRefs: MotionWorkflowPlanSourceRef[]): MotionWorkflowPlanSourceRef[] {
  const seen = new Set<string>();
  return sourceRefs.filter((source) => {
    const key = `${source.kind}:${source.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonNegativeNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalNonNegativeNumberValue(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'source';
}
