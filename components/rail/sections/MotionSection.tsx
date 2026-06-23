'use client';

import { Loader2, Video } from 'lucide-react';
import { useState } from 'react';
import type { AgentMotionStartResult } from '@/lib/motion/start';
import { motionStartSummary, setMotionStartResult } from '@/lib/motion/start-store';
import type { MotionWorkflowIntent } from '@/lib/motion/workflowRouter';
import type { MotionPlatformTarget, MotionWorkflowMode } from '@/lib/motion/project';
import type { WorkflowSourceKind } from '@/lib/workflow/registry';
import { cn } from '@/lib/utils/cn';

type MotionStartStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: AgentMotionStartResult }
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
}

const INTENTS: MotionWorkflowIntent[] = ['launch', 'feature', 'social', 'demo', 'pr'];
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

export function motionSectionSummary(result: AgentMotionStartResult | undefined): string {
  return motionStartSummary(result);
}

export function MotionSection({
  workspaceId,
  startMotion = defaultStartMotion,
}: MotionSectionProps) {
  const [source, setSource] = useState('');
  const [intent, setIntent] = useState<MotionWorkflowIntent>('launch');
  const [mode, setMode] = useState<MotionWorkflowMode>('review');
  const [targetPresetId, setTargetPresetId] = useState<string>(TARGET_PRESETS[0].id);
  const [status, setStatus] = useState<MotionStartStatus>({ kind: 'idle' });
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
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
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
        <div
          role="status"
          data-testid="motion-status"
          className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-caption text-xs text-ink-dim"
        >
          {motionStartSummary(status.result)}
        </div>
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
