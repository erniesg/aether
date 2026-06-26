'use client';

import { Loader2, Play, Video } from 'lucide-react';
import { useState } from 'react';
import type { AgentMotionStartResult } from '@/lib/motion/start';
import {
  applyMotionAgentHandoffResult,
  motionAgentHandoffMissingPlaceholders,
  runMotionAgentHandoffFromStart,
  type MotionAgentHandoffClientResult,
} from '@/lib/motion/agentHandoffClient';
import { motionStartSummary, setMotionStartResult } from '@/lib/motion/start-store';
import type { MotionWorkflowIntent } from '@/lib/motion/workflowRouter';
import type { MotionPlatformTarget, MotionWorkflowMode } from '@/lib/motion/project';
import type { WorkflowSourceKind } from '@/lib/workflow/registry';
import { cn } from '@/lib/utils/cn';

export type { MotionAgentHandoffClientResult } from '@/lib/motion/agentHandoffClient';

type MotionStartStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: AgentMotionStartResult }
  | { kind: 'error'; message: string };

type MotionHandoffStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: MotionAgentHandoffClientResult }
  | { kind: 'error'; message: string };

export interface MotionStartClientRequest {
  workspaceId?: string;
  sourceRefs?: Array<{ kind: WorkflowSourceKind; ref: string; label?: string }>;
  repoPath?: string;
  repoUrl?: string;
  siteUrl?: string;
  prRef?: string;
  intent: MotionWorkflowIntent;
  mode: MotionWorkflowMode;
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  requestedEngines: ['remotion', 'hyperframes', 'provider'];
}

export interface MotionSectionProps {
  workspaceId?: string;
  startMotion?: (request: MotionStartClientRequest) => Promise<AgentMotionStartResult>;
  runAgentHandoff?: (
    result: AgentMotionStartResult
  ) => Promise<MotionAgentHandoffClientResult>;
}

const INTENTS: MotionWorkflowIntent[] = [
  'launch',
  'feature',
  'social',
  'demo',
  'pr',
  'caption-overlay',
  'motion-graphic',
  'port',
];
const TARGET_PRESETS = [
  {
    id: 'x-vertical',
    label: 'x vertical',
    summary: '9:16 30s',
    targets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
  },
  {
    id: 'linkedin-feed',
    label: 'linkedin feed',
    summary: '4:5 45s',
    targets: [{ platform: 'linkedin', aspectRatio: '4:5', seconds: 45 }],
  },
  {
    id: 'site-demo',
    label: 'site demo',
    summary: '16:9 60s',
    targets: [{ platform: 'website', aspectRatio: '16:9', seconds: 60 }],
  },
  {
    id: 'launch-pack',
    label: 'launch pack',
    summary: 'x + linkedin + site',
    targets: [
      { platform: 'x', aspectRatio: '9:16', seconds: 30 },
      { platform: 'linkedin', aspectRatio: '4:5', seconds: 45 },
      { platform: 'website', aspectRatio: '16:9', seconds: 60 },
    ],
  },
] as const satisfies Array<{
  id: string;
  label: string;
  summary: string;
  targets: MotionPlatformTarget[];
}>;

async function defaultStartMotion(
  request: MotionStartClientRequest
): Promise<AgentMotionStartResult> {
  const res = await fetch('/api/motion/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const json = (await res.json()) as AgentMotionStartResult & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `motion start failed: ${res.status}`);
  }
  return json;
}

async function defaultRunAgentHandoff(
  result: AgentMotionStartResult
): Promise<MotionAgentHandoffClientResult> {
  return runMotionAgentHandoffFromStart(result);
}

export function motionSectionSummary(result: AgentMotionStartResult | undefined): string {
  return motionStartSummary(result);
}

export function MotionSection({
  workspaceId,
  startMotion = defaultStartMotion,
  runAgentHandoff = defaultRunAgentHandoff,
}: MotionSectionProps) {
  const [source, setSource] = useState('');
  const [intent, setIntent] = useState<MotionWorkflowIntent>('launch');
  const [mode, setMode] = useState<MotionWorkflowMode>('review');
  const [targetPresetId, setTargetPresetId] = useState<string>(TARGET_PRESETS[0].id);
  const [status, setStatus] = useState<MotionStartStatus>({ kind: 'idle' });
  const [handoffStatus, setHandoffStatus] = useState<MotionHandoffStatus>({ kind: 'idle' });
  const sourceRef = source.trim();
  const canStart = sourceRef.length > 0 && status.kind !== 'running';
  const selectedTargetPreset =
    TARGET_PRESETS.find((preset) => preset.id === targetPresetId) ?? TARGET_PRESETS[0];

  const runStart = async () => {
    if (!canStart) return;
    setStatus({ kind: 'running' });
    try {
      const result = await startMotion({
        workspaceId,
        ...sourcePayload(sourceRef, intent),
        intent,
        mode,
        audience: 'builders and creators',
        tone: 'clear, visual, product-led',
        platformTargets: selectedTargetPreset.targets.map((target) => ({ ...target })),
        requestedEngines: ['remotion', 'hyperframes', 'provider'],
      });
      setMotionStartResult(workspaceId, result);
      setStatus({ kind: 'done', result });
      setHandoffStatus({ kind: 'idle' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const continueFullAuto = async (result: AgentMotionStartResult) => {
    if (handoffStatus.kind === 'running') return;
    setHandoffStatus({ kind: 'running' });
    try {
      const handoffResult = await runAgentHandoff(result);
      const updatedResult = applyMotionAgentHandoffResult(result, handoffResult);
      setMotionStartResult(workspaceId, updatedResult);
      setStatus({ kind: 'done', result: updatedResult });
      setHandoffStatus({ kind: 'done', result: handoffResult });
    } catch (error) {
      setHandoffStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="motion-section">
      <section className="flex flex-col gap-1.5">
        <span className="font-caption text-ink-dim">source</span>
        <textarea
          aria-label="motion source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void runStart();
          }}
          placeholder="repo, PR, site URL, local path, or source set"
          rows={3}
          className="min-h-16 resize-y rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
        />
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="font-caption text-ink-dim">intent</span>
          <select
            aria-label="motion intent"
            value={intent}
            onChange={(event) => setIntent(event.target.value as MotionWorkflowIntent)}
            className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
          >
            {INTENTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="motion mode"
          className="flex rounded-sm border border-border-soft bg-surface-panel-muted p-0.5"
        >
          {(['review', 'full-auto'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'rounded-[3px] px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors',
                mode === value ? 'bg-surface-panel text-ink' : 'text-ink-dim hover:text-ink'
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <span className="font-caption text-ink-dim">target</span>
        <select
          aria-label="motion target"
          value={targetPresetId}
          onChange={(event) => setTargetPresetId(event.target.value)}
          className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
        >
          {TARGET_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} - {preset.summary}
            </option>
          ))}
        </select>
      </section>

      <button
        type="button"
        onClick={() => void runStart()}
        disabled={!canStart}
        className={cn(
          'inline-flex h-8 items-center justify-center gap-1 rounded-sm border px-2 font-mono text-2xs uppercase tracking-wide',
          'border-border-soft bg-surface-panel text-ink transition-colors',
          'hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'
        )}
      >
        {status.kind === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <Video className="h-3 w-3" aria-hidden="true" />
        )}
        {status.kind === 'running' ? 'starting' : 'start video'}
      </button>

      {status.kind === 'done' ? (
        <>
          <div
            role="status"
            data-testid="motion-status"
            className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-caption text-xs text-ink-dim"
          >
            {motionStartSummary(status.result)}
          </div>
          <MotionReviewQueue
            result={status.result}
            handoffStatus={handoffStatus}
            onContinueFullAuto={() => void continueFullAuto(status.result)}
          />
        </>
      ) : status.kind === 'error' ? (
        <div
          role="alert"
          data-testid="motion-status"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-caption text-xs text-ink-dim"
        >
          {status.message}
        </div>
      ) : null}
    </div>
  );
}

function MotionReviewQueue({
  result,
  handoffStatus,
  onContinueFullAuto,
}: {
  result: AgentMotionStartResult;
  handoffStatus: MotionHandoffStatus;
  onContinueFullAuto: () => void;
}) {
  const previewPlan = result.previewPlan;
  if (!previewPlan) return null;

  const nextTemplate = result.agentHandoff
    ? result.agentHandoff.templates.find(
        (template) => template.id === result.agentHandoff?.nextTemplateId
      ) ??
      result.agentHandoff.templates[0] ??
      null
    : null;
  const canContinue =
    result.agentHandoff?.mode === 'full-auto' &&
    nextTemplate?.route === '/api/motion/full-auto';
  const handoffReceiptLabel = handoffStatusLabel(handoffStatus);

  return (
    <section
      role="region"
      aria-label="motion review queue"
      className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-caption text-xs text-ink">{previewPlan.title}</div>
          <div className="mt-1 flex flex-wrap gap-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
            <span>{previewPlan.videoPlan.sceneCount} scenes</span>
            <span>{previewPlan.videoPlan.totalSeconds}s</span>
            <span>{previewPlan.workflowMode === 'full-auto' ? 'full auto' : 'review'}</span>
          </div>
        </div>
        {nextTemplate ? (
          <span className="shrink-0 rounded-sm border border-border-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
            next
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2">
        <MotionReviewQueueList
          label="drafts"
          items={previewPlan.draftOptions.slice(0, 3).map((draft) => draft.label)}
        />
        <MotionReviewQueueList
          label="regenerate"
          items={previewPlan.regenerationActions.slice(0, 2).map((action) => action.label)}
        />
        {nextTemplate ? (
          <MotionReviewQueueList label="next action" items={[nextTemplate.label]} />
        ) : null}
      </div>

      {canContinue ? (
        <button
          type="button"
          onClick={onContinueFullAuto}
          disabled={
            handoffStatus.kind === 'running' ||
            (handoffStatus.kind === 'done' && handoffStatus.result.status === 'complete')
          }
          className={cn(
            'mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-sm border px-2 font-mono text-2xs uppercase tracking-wide',
            'border-border-soft bg-surface-panel text-ink transition-colors',
            'hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {handoffStatus.kind === 'running' ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-3 w-3" aria-hidden="true" />
          )}
          {handoffStatus.kind === 'running'
            ? 'continuing'
            : handoffStatus.kind === 'done' && handoffStatus.result.status === 'complete'
              ? 'full auto complete'
              : 'continue full auto'}
        </button>
      ) : null}

      {handoffReceiptLabel ? (
        <div className="mt-2 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim">
          {handoffReceiptLabel}
        </div>
      ) : null}

      {handoffStatus.kind === 'error' ? (
        <div className="mt-2 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-2xs text-ink-dim">
          {handoffStatus.message}
        </div>
      ) : null}
    </section>
  );
}

function handoffStatusLabel(status: MotionHandoffStatus): string | null {
  if (status.kind !== 'done') return null;
  if (status.result.status === 'complete') return 'full auto complete';
  if (status.result.status === 'failed') return 'full auto failed';

  const missingPlaceholders = motionAgentHandoffMissingPlaceholders(status.result);
  return missingPlaceholders.length > 0
    ? `missing ${missingPlaceholders.join(', ')}`
    : 'full auto blocked';
}

function MotionReviewQueueList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="min-w-0">
      <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="max-w-full truncate rounded-sm border border-border-soft bg-surface-panel px-1.5 py-0.5 font-caption text-2xs text-ink-dim"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

type MotionSourceEntry = NonNullable<MotionStartClientRequest['sourceRefs']>[number];

const SOURCE_PREFIXES = {
  repo: { kind: 'repo', label: 'Repo' },
  pr: { kind: 'pr', label: 'Pull request' },
  site: { kind: 'site', label: 'Site' },
  capture: { kind: 'capture', label: 'Capture' },
  upload: { kind: 'upload', label: 'Upload' },
  reference: { kind: 'reference', label: 'Reference' },
  ref: { kind: 'reference', label: 'Reference' },
  remotion: { kind: 'remotion', label: 'Remotion' },
  hyperframes: { kind: 'hyperframes', label: 'HyperFrames' },
} as const satisfies Record<string, { kind: WorkflowSourceKind; label: string }>;

function sourcePayload(
  source: string,
  intent: MotionWorkflowIntent
): Partial<MotionStartClientRequest> {
  if (hasSourceSetSyntax(source)) {
    return { sourceRefs: parseSourceSet(source, intent) };
  }

  if (isPullRequestRef(source)) return { prRef: source };
  if (/^https?:\/\/github\.com\//i.test(source)) return { repoUrl: source };
  if (/^https?:\/\//i.test(source) && isReferenceUrl(source)) {
    return { sourceRefs: [inferSourceEntry(source, intent)] };
  }
  if (/^https?:\/\//i.test(source)) return { siteUrl: source };
  if (intent === 'pr' || /^[^/\s#]+\/[^/\s#]+#\d+$/.test(source)) {
    return { sourceRefs: [{ kind: 'pr', ref: source, label: 'Pull request' }] };
  }
  return { repoPath: source };
}

function hasSourceSetSyntax(source: string): boolean {
  return splitSourceSet(source).length > 1 || sourcePrefixPattern().test(source);
}

function parseSourceSet(source: string, intent: MotionWorkflowIntent): MotionSourceEntry[] {
  return splitSourceSet(source).map((entry) => parseExplicitSourceEntry(entry) ?? inferSourceEntry(entry, intent));
}

function splitSourceSet(source: string): string[] {
  return source
    .split(/\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseExplicitSourceEntry(source: string): MotionSourceEntry | null {
  const match = sourcePrefixPattern().exec(source);
  if (!match) return null;

  const prefix = match[1].toLowerCase() as keyof typeof SOURCE_PREFIXES;
  const ref = match[2].trim();
  const config = SOURCE_PREFIXES[prefix];
  return {
    kind: config.kind,
    ref,
    label: config.label,
  };
}

function inferSourceEntry(source: string, intent: MotionWorkflowIntent): MotionSourceEntry {
  if (isPullRequestRef(source) || intent === 'pr' || /^[^/\s#]+\/[^/\s#]+#\d+$/.test(source)) {
    return { kind: 'pr', ref: source, label: 'Pull request' };
  }

  if (/^https?:\/\/github\.com\//i.test(source)) return { kind: 'repo', ref: source, label: 'Repo' };
  if (/^https?:\/\//i.test(source) && isReferenceUrl(source)) {
    return { kind: 'reference', ref: source, label: 'Reference' };
  }
  if (/^https?:\/\//i.test(source)) return { kind: 'site', ref: source, label: 'Site' };

  return { kind: 'repo', ref: source, label: 'Local repo' };
}

function sourcePrefixPattern(): RegExp {
  return /^\s*(repo|pr|site|capture|upload|reference|ref|remotion|hyperframes)\s*:\s*(.+)\s*$/i;
}

function isPullRequestRef(source: string): boolean {
  return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i.test(source);
}

function isReferenceUrl(source: string): boolean {
  try {
    const host = new URL(source).hostname.replace(/^www\./, '').toLowerCase();
    return [
      'x.com',
      'twitter.com',
      'youtube.com',
      'youtu.be',
      'vimeo.com',
      'tiktok.com',
      'instagram.com',
      'producthunt.com',
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
