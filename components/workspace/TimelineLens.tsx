'use client';

import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { getMotionComponent } from '@/lib/motion/componentRegistry';
import {
  MOTION_EFFECT_PRESETS,
  type MotionEffectPresetId,
} from '@/lib/motion/effectPresets';
import type { AgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import type { MotionRenderEngine } from '@/lib/providers/video/types';
import type { MotionWorkflowExample } from '@/lib/motion/workflowExamples';
import type { MotionGraphNode, TimelineClip, TimelineTrack } from '@/lib/motion/project';
import type { MotionDesignKitPlan } from '@/lib/motion/designKit';
import { motionSeconds } from '@/lib/motion/project';
import type {
  MotionPreviewEnginePlan,
  MotionPreviewExportPackSummary,
  MotionPreviewPlan,
  MotionPreviewRegenerationAction,
  MotionPreviewSyncBeat,
  MotionPreviewSyncSoundCue,
  MotionPreviewSyncSummary,
  MotionPreviewTimelineClip,
  MotionPreviewTimelineRow,
  MotionPreviewVideoPlan,
  MotionPreviewVideoPlanScene,
  MotionPreviewVisualGenerationSummary,
} from '@/lib/motion/previewPlan';
import { cn } from '@/lib/utils/cn';

export interface TimelineLensProps {
  tracks: TimelineTrack[];
  previewPlan?: MotionPreviewPlan | null;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSelectDraft?: (draftId: string) => void;
  onRegenerateComponent?: (actionId: string) => void;
  onGenerateVoice?: () => void;
  onSyncMotion?: () => void;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
  onExportPack?: () => void;
  onGenerateVideoClips?: () => void;
  onCaptureMotion?: (requestIds?: string[]) => void;
  onPinMotionSkill?: () => void;
  onEditClipSummary?: (clipId: string, summary: string) => void;
  onEditClipEffect?: (clipId: string, effectPreset: MotionEffectPresetId) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
  capturePlan?: AgentMotionCapturePlan | null;
  graphNodes?: MotionGraphNode[];
  workflowExamples?: MotionWorkflowExample[];
  actionStatus?: string | null;
}

export function TimelineLens({
  tracks,
  previewPlan,
  selectedClipId,
  onSelectClip,
  onSelectDraft,
  onRegenerateComponent,
  onGenerateVoice,
  onSyncMotion,
  onRenderMotion,
  onExportPack,
  onGenerateVideoClips,
  onCaptureMotion,
  onPinMotionSkill,
  onEditClipSummary,
  onEditClipEffect,
  onEditClipTiming,
  capturePlan = null,
  graphNodes = [],
  workflowExamples = [],
  actionStatus = null,
}: TimelineLensProps) {
  const clipCount = previewPlan
    ? previewPlan.timelineRows.reduce((total, row) => total + row.clips.length, 0)
    : tracks.reduce((total, track) => total + track.clips.length, 0);
  const trackCount = previewPlan ? previewPlan.timelineRows.length : tracks.length;

  return (
    <Surface
      as="section"
      role="region"
      aria-label="timeline"
      tone="canvas"
      taxonomy="output"
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-soft px-4">
        <div className="flex items-center gap-2">
          <span className="font-caption text-sm text-ink">timeline</span>
          <Chip tone={clipCount > 0 ? 'info' : 'neutral'} size="sm">
            {trackCount} tracks
          </Chip>
        </div>
        <Chip tone={clipCount > 0 ? 'ok' : 'neutral'} size="sm">
          {clipCount} clips
        </Chip>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {previewPlan ? (
          <MotionPreviewPlanView
            previewPlan={previewPlan}
            selectedClipId={selectedClipId}
            onSelectClip={onSelectClip}
            onSelectDraft={onSelectDraft}
            onRegenerateComponent={onRegenerateComponent}
            onGenerateVoice={onGenerateVoice}
            onSyncMotion={onSyncMotion}
            onRenderMotion={onRenderMotion}
            onExportPack={onExportPack}
            onGenerateVideoClips={onGenerateVideoClips}
            onCaptureMotion={onCaptureMotion}
            onPinMotionSkill={onPinMotionSkill}
            onEditClipSummary={onEditClipSummary}
            onEditClipEffect={onEditClipEffect}
            onEditClipTiming={onEditClipTiming}
            capturePlan={capturePlan}
            graphNodes={graphNodes}
            workflowExamples={workflowExamples}
            actionStatus={actionStatus}
          />
        ) : tracks.length > 0 ? (
          tracks.map((track) => (
            <TimelineTrackRow
              key={track.id}
              track={track}
              selectedClipId={selectedClipId}
              onSelectClip={onSelectClip}
            />
          ))
        ) : workflowExamples.length > 0 ? (
          <WorkflowExamplesView examples={workflowExamples} />
        ) : (
          <div className="flex min-h-[220px] flex-1 items-center justify-center px-6 text-center font-caption text-sm text-ink-faint">
            no clips staged
          </div>
        )}
      </div>
    </Surface>
  );
}

function MotionPreviewPlanView({
  previewPlan,
  selectedClipId,
  onSelectClip,
  onSelectDraft,
  onRegenerateComponent,
  onGenerateVoice,
  onSyncMotion,
  onRenderMotion,
  onExportPack,
  onGenerateVideoClips,
  onCaptureMotion,
  onPinMotionSkill,
  onEditClipSummary,
  onEditClipEffect,
  onEditClipTiming,
  capturePlan,
  graphNodes,
  workflowExamples,
  actionStatus,
}: {
  previewPlan: MotionPreviewPlan;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSelectDraft?: (draftId: string) => void;
  onRegenerateComponent?: (actionId: string) => void;
  onGenerateVoice?: () => void;
  onSyncMotion?: () => void;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
  onExportPack?: () => void;
  onGenerateVideoClips?: () => void;
  onCaptureMotion?: (requestIds?: string[]) => void;
  onPinMotionSkill?: () => void;
  onEditClipSummary?: (clipId: string, summary: string) => void;
  onEditClipEffect?: (clipId: string, effectPreset: MotionEffectPresetId) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
  capturePlan: AgentMotionCapturePlan | null;
  graphNodes: MotionGraphNode[];
  workflowExamples: MotionWorkflowExample[];
  actionStatus: string | null;
}) {
  const selectedClip = findPreviewClip(previewPlan, selectedClipId);
  const renderEngine = preferredRenderEngine(previewPlan.enginePreviews);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="border-b border-border-soft px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-caption text-base text-ink">{previewPlan.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Chip tone="neutral" size="sm">
                {previewPlan.summary.appName}
              </Chip>
              <Chip tone="neutral" size="sm">
                {previewPlan.summary.projectKind}
              </Chip>
              <Chip tone="info" size="sm">
                {previewPlan.summary.totalSeconds}s
              </Chip>
              {previewPlan.summary.targetPlatforms.map((target) => (
                <Chip key={target} tone="neutral" size="sm">
                  {target}
                </Chip>
              ))}
            </div>
          </div>
          <Chip tone={previewPlan.primaryAction === 'queue-render' ? 'ok' : 'info'} size="sm">
            {previewPlan.primaryAction === 'queue-render' ? 'full auto' : 'review'}
          </Chip>
        </div>
      </section>

      <section className="grid gap-3 border-b border-border-soft px-4 py-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            drafts
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {previewPlan.draftOptions.map((draft) => (
              <button
                key={draft.draftId}
                type="button"
                aria-pressed={draft.isCurrent}
                onClick={() => onSelectDraft?.(draft.draftId)}
                className={cn(
                  'flex min-w-[170px] flex-col rounded-sm border px-3 py-2 text-left transition-colors duration-fast ease-quick',
                  draft.isCurrent
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-border-soft bg-surface-panel text-ink-dim hover:border-border hover:text-ink'
                )}
              >
                <span className="truncate font-caption text-xs">{draft.label}</span>
                <span className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
                  {draft.angle}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            engines
          </div>
          <div className="grid gap-1.5">
            {previewPlan.enginePreviews.map((engine) => (
              <EnginePreviewRow key={engine.engine} engine={engine} />
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            finish
          </div>
          <div className="grid gap-1.5">
            <SyncSummaryRow summary={previewPlan.syncSummary} />
            {onSyncMotion ? (
              <SyncActionButton
                syncStatus={previewPlan.syncSummary.status}
                onSyncMotion={onSyncMotion}
              />
            ) : null}
            <ExportPackSummaryRow summary={previewPlan.exportPackSummary} />
            <VisualGenerationSummaryRow summary={previewPlan.visualGenerationSummary} />
            {onGenerateVoice ? (
              <VoiceActionButton
                syncStatus={previewPlan.syncSummary.status}
                onGenerateVoice={onGenerateVoice}
              />
            ) : null}
            {onRenderMotion && renderEngine ? (
              <RenderActionButton
                engine={renderEngine.engine}
                exportStatus={previewPlan.exportPackSummary.status}
                onRenderMotion={onRenderMotion}
              />
            ) : null}
            {onExportPack ? (
              <ExportPackActionButton onExportPack={onExportPack} />
            ) : null}
            {onGenerateVideoClips ? (
              <ImageToVideoActionButton
                summary={previewPlan.visualGenerationSummary}
                onGenerateVideoClips={onGenerateVideoClips}
              />
            ) : null}
            {onPinMotionSkill ? (
              <PinMotionSkillButton onPinMotionSkill={onPinMotionSkill} />
            ) : null}
          </div>
        </div>
      </section>

      {graphNodes.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionGraphStrip nodes={graphNodes} />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionDesignKitStrip kit={previewPlan.designKit} />
      </section>

      {capturePlan ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionCapturePlanView
            capturePlan={capturePlan}
            onCaptureMotion={onCaptureMotion}
          />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionVisualGenerationStrip
          summary={previewPlan.visualGenerationSummary}
          onGenerateVideoClips={onGenerateVideoClips}
        />
      </section>

      {previewPlan.syncBeats.length > 0 || previewPlan.syncSoundCues.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionSyncPlanStrip
            status={previewPlan.syncSummary.status}
            beats={previewPlan.syncBeats}
            soundCues={previewPlan.syncSoundCues}
          />
        </section>
      ) : null}

      {workflowExamples.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <WorkflowExamplesGrid examples={workflowExamples} />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionVideoPlanReview
          videoPlan={previewPlan.videoPlan}
          onRegenerateComponent={onRegenerateComponent}
        />
      </section>

      <section className="grid gap-3 border-b border-border-soft px-4 py-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            story
          </div>
          <ol className="grid gap-1.5">
            {previewPlan.storyboard.map((beat) => (
              <li
                key={beat.beatId}
                className="grid grid-cols-[72px_minmax(0,1fr)_54px] items-start gap-2 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
              >
                <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
                  {beat.role}
                </span>
                <span className="min-w-0 font-caption text-xs text-ink">
                  {beat.narration}
                </span>
                <span className="text-right font-mono text-2xs uppercase tracking-wide text-ink-faint">
                  {beat.targetSeconds}s
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            editable
          </div>
          <div className="grid gap-1.5">
            {previewPlan.editableComponents.map((component) => (
              <div
                key={`${component.clipId}-${component.componentId}`}
                className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
              >
                <div className="font-caption text-xs text-ink">{component.componentLabel}</div>
                <div className="mt-1 font-mono text-2xs text-ink-faint">
                  {component.editControlIds.join(' / ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex min-h-[168px] flex-1 flex-col">
        {previewPlan.timelineRows.length > 0 ? (
          previewPlan.timelineRows.map((row) => (
            <PreviewTimelineRow
              key={row.trackId}
              row={row}
              selectedClipId={selectedClipId}
              onSelectClip={onSelectClip}
            />
          ))
        ) : (
          <div className="flex min-h-[180px] flex-1 items-center justify-center px-6 text-center font-caption text-sm text-ink-faint">
            no clips staged
          </div>
        )}
      </div>

      {selectedClip ? (
        <SelectedClipEditor
          clip={selectedClip}
          onEditClipSummary={onEditClipSummary}
          onEditClipEffect={onEditClipEffect}
          onEditClipTiming={onEditClipTiming}
        />
      ) : null}

      {previewPlan.regenerationActions.length > 0 ? (
        <section className="flex flex-wrap gap-2 border-t border-border-soft px-4 py-3">
          {previewPlan.regenerationActions.map((action) => (
            <RegenerateActionButton
              key={action.id}
              action={action}
              onRegenerateComponent={onRegenerateComponent}
            />
          ))}
        </section>
      ) : null}

      {actionStatus ? (
        <div
          role="status"
          className="border-t border-border-soft px-4 py-2 font-caption text-xs text-ink-dim"
        >
          {actionStatus}
        </div>
      ) : null}
    </div>
  );
}

function MotionDesignKitStrip({
  kit,
}: {
  kit: MotionDesignKitPlan;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            motion kit
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {kit.summary}
          </div>
        </div>
        <Chip tone="info" size="sm">
          {kit.label}
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">{kit.rhythm}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {kit.components.slice(0, 6).map((component) => (
              <Chip key={`${component.label}-${component.role}`} tone="neutral" size="sm">
                {component.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {kit.editableSurfaceLabels.join(' / ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {kit.effects.map((effect) => (
              <Chip key={effect.label} tone="neutral" size="sm">
                {effect.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MotionVideoPlanReview({
  videoPlan,
  onRegenerateComponent,
}: {
  videoPlan: MotionPreviewVideoPlan;
  onRegenerateComponent?: (actionId: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            video plan
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {videoPlan.sceneCount} scenes / {videoPlan.totalSeconds}s
          </div>
        </div>
        <Chip tone={videoPlan.status === 'ready-for-render' ? 'ok' : 'info'} size="sm">
          {videoPlan.status.replace(/-/g, ' ')}
        </Chip>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {videoPlan.scenes.map((scene) => (
          <MotionVideoPlanSceneCard
            key={scene.sceneId}
            scene={scene}
            onRegenerateComponent={onRegenerateComponent}
          />
        ))}
      </ol>
    </div>
  );
}

function MotionVideoPlanSceneCard({
  scene,
  onRegenerateComponent,
}: {
  scene: MotionPreviewVideoPlanScene;
  onRegenerateComponent?: (actionId: string) => void;
}) {
  return (
    <li className="flex min-w-[220px] max-w-[260px] flex-col rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          {scene.role}
        </span>
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
          {scene.startSeconds}s / {scene.durationSeconds}s
        </span>
      </div>
      <div className="mt-1 font-caption text-xs text-ink">{scene.visualLabel}</div>
      <div className="mt-1 line-clamp-3 font-caption text-2xs text-ink-dim">
        {scene.narration}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate font-caption text-2xs text-ink-faint">
          {scene.evidenceLabel}
        </span>
        {onRegenerateComponent && scene.regenerationActions.length > 0 ? (
          <div className="flex shrink-0 gap-1">
            {scene.regenerationActions.slice(0, 2).map((action) => (
              <button
                key={action.id}
                type="button"
                aria-label={`regenerate ${scene.role} scene ${action.scope}`}
                onClick={() => onRegenerateComponent(action.id)}
                className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                regen {action.scope}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function findPreviewClip(
  previewPlan: MotionPreviewPlan,
  selectedClipId: string | null
): MotionPreviewTimelineClip | null {
  if (!selectedClipId) return null;
  for (const row of previewPlan.timelineRows) {
    const clip = row.clips.find((candidate) => candidate.clipId === selectedClipId);
    if (clip) return clip;
  }
  return null;
}

function preferredRenderEngine(
  engines: MotionPreviewEnginePlan[]
): (MotionPreviewEnginePlan & { engine: MotionRenderEngine }) | null {
  return (
    engines.find(
      (engine): engine is MotionPreviewEnginePlan & { engine: MotionRenderEngine } =>
        engine.engine === 'remotion' && engine.status === 'ready'
    ) ??
    engines.find(
      (engine): engine is MotionPreviewEnginePlan & { engine: MotionRenderEngine } =>
        engine.engine === 'hyperframes' && engine.status === 'ready'
    ) ??
    null
  );
}

function SelectedClipEditor({
  clip,
  onEditClipSummary,
  onEditClipEffect,
  onEditClipTiming,
}: {
  clip: MotionPreviewTimelineClip;
  onEditClipSummary?: (clipId: string, summary: string) => void;
  onEditClipEffect?: (clipId: string, effectPreset: MotionEffectPresetId) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
}) {
  const [summary, setSummary] = useState(clip.summary);
  const [startSeconds, setStartSeconds] = useState(formatSecondsInput(clip.startSeconds));
  const [durationSeconds, setDurationSeconds] = useState(
    formatSecondsInput(clip.durationSeconds)
  );

  useEffect(() => {
    setSummary(clip.summary);
    setStartSeconds(formatSecondsInput(clip.startSeconds));
    setDurationSeconds(formatSecondsInput(clip.durationSeconds));
  }, [clip.clipId, clip.durationSeconds, clip.startSeconds, clip.summary]);

  const canApply = summary.trim().length > 0 && summary.trim() !== clip.summary.trim();
  const canEditEffects = clip.regenerateScopes.includes('effect') && Boolean(onEditClipEffect);
  const parsedStartSeconds = Number(startSeconds);
  const parsedDurationSeconds = Number(durationSeconds);
  const timingIsValid =
    Number.isFinite(parsedStartSeconds) &&
    Number.isFinite(parsedDurationSeconds) &&
    parsedStartSeconds >= 0 &&
    parsedDurationSeconds > 0;
  const timingChanged =
    Math.abs(parsedStartSeconds - clip.startSeconds) > 0.001 ||
    Math.abs(parsedDurationSeconds - clip.durationSeconds) > 0.001;
  const canApplyTiming = Boolean(onEditClipTiming) && timingIsValid && timingChanged;

  return (
    <section className="grid gap-3 border-t border-border-soft px-4 py-3 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="font-caption text-xs text-ink">{clip.componentLabel}</div>
        <div className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
          {clip.durationSeconds.toFixed(1)}s · {clip.linkedVariantScope ?? 'local'}
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            type="text"
            aria-label="selected clip summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!canApply}
            onClick={() => onEditClipSummary?.(clip.clipId, summary.trim())}
            className="rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            apply
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,120px)_minmax(0,120px)_auto]">
          <label className="grid gap-1 font-caption text-2xs text-ink-dim">
            start
            <input
              type="number"
              min="0"
              step="0.1"
              aria-label="clip start seconds"
              value={startSeconds}
              onChange={(event) => setStartSeconds(event.target.value)}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="grid gap-1 font-caption text-2xs text-ink-dim">
            duration
            <input
              type="number"
              min="0.1"
              step="0.1"
              aria-label="clip duration seconds"
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(event.target.value)}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={!canApplyTiming}
            onClick={() =>
              onEditClipTiming?.(clip.clipId, parsedStartSeconds, parsedDurationSeconds)
            }
            className="self-end rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            apply timing
          </button>
        </div>
        {canEditEffects ? (
          <div className="flex flex-wrap gap-1" aria-label="effect presets">
            {MOTION_EFFECT_PRESETS.map((preset) => {
              const selected = clip.effectPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={`apply ${preset.label} effect`}
                  aria-pressed={selected}
                  onClick={() => onEditClipEffect?.(clip.clipId, preset.id)}
                  className={cn(
                    'rounded-sm border px-2 py-1 font-mono text-2xs uppercase tracking-wide transition-colors',
                    selected
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-soft bg-surface-panel text-ink-dim hover:border-accent hover:text-accent'
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatSecondsInput(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function WorkflowExamplesView({ examples }: { examples: MotionWorkflowExample[] }) {
  return (
    <div className="flex min-h-[260px] flex-1 flex-col px-4 py-4">
      <WorkflowExamplesGrid examples={examples} />
    </div>
  );
}

function WorkflowExamplesGrid({ examples }: { examples: MotionWorkflowExample[] }) {
  return (
    <div className="grid gap-2 lg:grid-cols-3">
      {examples.map((example) => (
        <WorkflowExampleCard key={example.id} example={example} />
      ))}
    </div>
  );
}

function WorkflowExampleCard({ example }: { example: MotionWorkflowExample }) {
  return (
    <article className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-caption text-xs text-ink">{example.label}</h3>
          <p className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
            {example.summary}
          </p>
        </div>
        <Chip tone={example.suggestedMode === 'full-auto' ? 'ok' : 'info'} size="sm">
          {example.suggestedMode}
        </Chip>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {example.platformTargets.slice(0, 3).map((target) => (
          <Chip key={target} tone="neutral" size="sm">
            {target}
          </Chip>
        ))}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
        {example.storyRoles.join(' / ')}
      </div>
      <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
        {example.editSurfaces.join(' / ')}
      </div>
    </article>
  );
}

function EnginePreviewRow({ engine }: { engine: MotionPreviewEnginePlan }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
      <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
        {engine.engine}
      </span>
      <span
        className={cn(
          'font-mono text-2xs uppercase tracking-wide',
          engine.status === 'ready' ? 'text-signal-ok' : 'text-ink-faint'
        )}
      >
        {engine.status}
      </span>
    </div>
  );
}

function SyncSummaryRow({ summary }: { summary: MotionPreviewSyncSummary }) {
  const details = [
    formatCount(summary.beatCount, 'beat'),
    formatCount(summary.captionCount, 'caption'),
    formatCount(summary.transitionCount, 'transition'),
  ];
  const note =
    summary.blockerLabels[0] ??
    (summary.requirementLabels.length > 0
      ? `Needs ${summary.requirementLabels.join(' + ')}`
      : `${summary.soundCueCount} sound cues`);

  return (
    <ReadinessRow
      label="sync"
      status={summary.status}
      detail={details.join(' / ')}
      note={note}
    />
  );
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function ExportPackSummaryRow({ summary }: { summary: MotionPreviewExportPackSummary }) {
  const targetDetail =
    summary.targetLabels.length > 0
      ? summary.targetLabels.join(' / ')
      : 'no export targets';
  const note =
    summary.blockerLabels[0] ??
    (summary.missingAssetKinds.length > 0
      ? `Needs ${summary.missingAssetKinds.join(' + ')}`
      : `${summary.canvasDropCount} canvas drops`);

  return (
    <ReadinessRow
      label="export pack"
      status={summary.status}
      detail={`${summary.readyCount}/${summary.totalCount} ready`}
      note={`${targetDetail}; ${note}`}
    />
  );
}

function VisualGenerationSummaryRow({
  summary,
}: {
  summary: MotionPreviewVisualGenerationSummary;
}) {
  const detail =
    summary.requestCount > 0
      ? formatCount(summary.requestCount, 'clip request')
      : summary.providerRequirementLabels.length > 0
        ? `Needs ${summary.providerRequirementLabels.join(' + ')}`
        : 'no generated clips';
  const note = summary.blockerLabels[0] ?? summary.requestLabels[0] ?? 'ready for visual clips';

  return (
    <ReadinessRow
      label="visual generation"
      status={summary.status}
      detail={detail}
      note={note}
    />
  );
}

function VoiceActionButton({
  syncStatus,
  onGenerateVoice,
}: {
  syncStatus: MotionPreviewSyncSummary['status'];
  onGenerateVoice: () => void;
}) {
  const ready = syncStatus === 'ready';

  return (
    <button
      type="button"
      disabled={ready}
      onClick={onGenerateVoice}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {ready ? 'voice ready' : 'generate voice'}
    </button>
  );
}

function SyncActionButton({
  syncStatus,
  onSyncMotion,
}: {
  syncStatus: MotionPreviewSyncSummary['status'];
  onSyncMotion: () => void;
}) {
  const ready = syncStatus === 'ready';

  return (
    <button
      type="button"
      onClick={onSyncMotion}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
    >
      {ready ? 'sync ready' : 'sync timeline'}
    </button>
  );
}

function RenderActionButton({
  engine,
  exportStatus,
  onRenderMotion,
}: {
  engine: MotionRenderEngine;
  exportStatus: MotionPreviewExportPackSummary['status'];
  onRenderMotion: (engine: MotionRenderEngine) => void;
}) {
  const ready = exportStatus === 'ready';

  return (
    <button
      type="button"
      disabled={ready}
      onClick={() => onRenderMotion(engine)}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {ready ? 'render ready' : `render ${engine}`}
    </button>
  );
}

function ExportPackActionButton({ onExportPack }: { onExportPack: () => void }) {
  return (
    <button
      type="button"
      onClick={onExportPack}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
    >
      export pack
    </button>
  );
}

function ImageToVideoActionButton({
  summary,
  onGenerateVideoClips,
}: {
  summary: MotionPreviewVisualGenerationSummary;
  onGenerateVideoClips: () => void;
}) {
  const ready = summary.status === 'ready';
  const label = ready
    ? 'generate clips'
    : summary.status === 'needs-visual-source'
      ? 'plan visuals'
      : 'prepare clips';

  return (
    <button
      type="button"
      onClick={onGenerateVideoClips}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}

function PinMotionSkillButton({ onPinMotionSkill }: { onPinMotionSkill: () => void }) {
  return (
    <button
      type="button"
      onClick={onPinMotionSkill}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
    >
      pin skill
    </button>
  );
}

function MotionSyncPlanStrip({
  status,
  beats,
  soundCues,
}: {
  status: MotionPreviewSyncSummary['status'];
  beats: MotionPreviewSyncBeat[];
  soundCues: MotionPreviewSyncSoundCue[];
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          sync plan
        </span>
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
          {status.replace(/-/g, ' ')}
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {beats.slice(0, 6).map((beat, index) => (
            <div
              key={`${beat.role}-${beat.startSeconds}-${index}`}
              className="min-w-[132px] rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="font-caption text-xs text-ink">{beat.role}</div>
              <div className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
                {beat.startSeconds}s / {beat.durationSeconds}s
              </div>
              <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                voice {beat.voiceStatus} · {beat.captionTimingSource}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          {soundCues.slice(0, 3).map((cue, index) => (
            <div
              key={`${cue.kind}-${cue.startSeconds}-${index}`}
              className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="font-caption text-xs text-ink">{cue.label}</div>
              <div className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
                {cue.kind} · {cue.startSeconds}s
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MotionVisualGenerationStrip({
  summary,
  onGenerateVideoClips,
}: {
  summary: MotionPreviewVisualGenerationSummary;
  onGenerateVideoClips?: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          visual generation
        </span>
        <Chip tone={summary.status === 'ready' ? 'ok' : 'info'} size="sm">
          {summary.status.replace(/-/g, ' ')}
        </Chip>
      </div>
      {summary.requests.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {summary.requests.map((request) => (
            <article
              key={request.requestId}
              className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-caption text-xs text-ink">{request.componentLabel}</span>
                <span className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
                  {request.durationSeconds}s
                </span>
              </div>
              <p className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                {request.prompt}
              </p>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {request.outputLabel}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 font-caption text-xs text-ink-dim">
          {summary.blockerLabels[0] ?? 'No image-to-video clips planned for this draft.'}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {summary.nextActionLabels.map((label) => (
          <Chip key={label} tone="neutral" size="sm">
            {label}
          </Chip>
        ))}
        {onGenerateVideoClips ? (
          <button
            type="button"
            onClick={onGenerateVideoClips}
            className="rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            {summary.status === 'ready' ? 'generate clips' : 'plan visuals'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MotionCapturePlanView({
  capturePlan,
  onCaptureMotion,
}: {
  capturePlan: AgentMotionCapturePlan;
  onCaptureMotion?: (requestIds?: string[]) => void;
}) {
  const requiredRequestIds = capturePlan.requests
    .filter((request) => request.required)
    .map((request) => request.id);
  const recordingRequest = capturePlan.requests.find(
    (request) => request.request.mode === 'screen-recording'
  );
  const targetLabel =
    capturePlan.target?.kind === 'url'
      ? captureTargetLabel(capturePlan.target.ref)
      : 'source needed';

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          captures
        </span>
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
          {capturePlan.status.replace(/-/g, ' ')}
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="mb-1 font-caption text-xs text-ink">{targetLabel}</div>
          {capturePlan.requests.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {capturePlan.requests.map((request) => (
                <div
                  key={request.id}
                  className="min-w-[160px] rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
                >
                  <div className="truncate font-caption text-xs text-ink">{request.label}</div>
                  <div className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
                    {request.request.mode.replace(/-/g, ' ')}
                  </div>
                  <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                    {request.expectedArtifacts.slice(0, 2).join(' / ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-caption text-2xs text-ink-dim">
              {capturePlan.fallbacks[0]?.label ?? 'Add a site or app URL before capture'}
            </div>
          )}
        </div>
        {onCaptureMotion ? (
          <div className="flex flex-wrap content-start gap-1.5">
            {requiredRequestIds.length > 0 ? (
              <button
                type="button"
                onClick={() => onCaptureMotion(requiredRequestIds)}
                className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                capture stills
              </button>
            ) : null}
            {recordingRequest ? (
              <button
                type="button"
                onClick={() => onCaptureMotion([recordingRequest.id])}
                className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                record flow
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function captureTargetLabel(ref: string): string {
  try {
    return new URL(ref).hostname;
  } catch {
    return 'app source';
  }
}

function MotionGraphStrip({ nodes }: { nodes: MotionGraphNode[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
        graph
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="flex min-w-[132px] flex-col rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
          >
            <span className="font-caption text-xs text-ink">
              {graphKindLabel(node.kind)}
            </span>
            <span className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
              {node.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function graphKindLabel(kind: MotionGraphNode['kind']): string {
  return kind.replace(/-/g, ' ');
}

function ReadinessRow({
  label,
  status,
  detail,
  note,
}: {
  label: string;
  status: string;
  detail: string;
  note: string;
}) {
  return (
    <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          {label}
        </span>
        <span
          className={cn(
            'font-mono text-2xs uppercase tracking-wide',
            status === 'ready' ? 'text-signal-ok' : 'text-ink-faint'
          )}
        >
          {status.replace(/-/g, ' ')}
        </span>
      </div>
      <div className="mt-1 truncate font-caption text-2xs text-ink-faint">{detail}</div>
      <div className="mt-0.5 line-clamp-2 font-caption text-2xs text-ink-dim">{note}</div>
    </div>
  );
}

function PreviewTimelineRow({
  row,
  selectedClipId,
  onSelectClip,
}: {
  row: MotionPreviewTimelineRow;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
}) {
  return (
    <section className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-border-soft">
      <div className="flex items-start border-r border-border-soft bg-surface-panel-muted px-3 py-3">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          {row.trackKind}
        </span>
      </div>
      <div className="flex min-h-[72px] min-w-0 items-center gap-2 overflow-x-auto px-3 py-2">
        {row.clips.length > 0 ? (
          row.clips.map((clip) => (
            <PreviewTimelineClipButton
              key={clip.clipId}
              clip={clip}
              selected={clip.clipId === selectedClipId}
              onSelectClip={onSelectClip}
            />
          ))
        ) : (
          <span className="font-caption text-xs text-ink-faint">empty</span>
        )}
      </div>
    </section>
  );
}

function PreviewTimelineClipButton({
  clip,
  selected,
  onSelectClip,
}: {
  clip: MotionPreviewTimelineClip;
  selected: boolean;
  onSelectClip: (clipId: string) => void;
}) {
  const width = Math.max(112, Math.min(360, clip.durationSeconds * 36));

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${clip.componentLabel} clip`}
      onClick={() => onSelectClip(clip.clipId)}
      className={cn(
        'flex h-12 shrink-0 flex-col justify-center rounded-sm border px-2 text-left transition-colors duration-fast ease-quick',
        selected
          ? 'border-accent bg-accent/10 text-ink'
          : 'border-border-soft bg-surface-panel text-ink-dim hover:border-border hover:text-ink'
      )}
      style={{ width }}
    >
      <span className="truncate font-caption text-xs">{clip.componentLabel}</span>
      <span className="flex min-w-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        {clip.summary ? <span className="truncate">{clip.summary}</span> : null}
        <span className="shrink-0">{clip.durationSeconds.toFixed(1)}s</span>
      </span>
    </button>
  );
}

function RegenerateActionButton({
  action,
  onRegenerateComponent,
}: {
  action: MotionPreviewRegenerationAction;
  onRegenerateComponent?: (actionId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onRegenerateComponent?.(action.id)}
      className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink"
    >
      {action.label}
    </button>
  );
}

function TimelineTrackRow({
  track,
  selectedClipId,
  onSelectClip,
}: {
  track: TimelineTrack;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
}) {
  return (
    <section className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-border-soft">
      <div className="flex items-start border-r border-border-soft bg-surface-panel-muted px-3 py-3">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          {track.kind}
        </span>
      </div>
      <div className="flex min-h-[72px] min-w-0 items-center gap-2 overflow-x-auto px-3 py-2">
        {track.clips.length > 0 ? (
          track.clips.map((clip) => (
            <TimelineClipButton
              key={clip.id}
              clip={clip}
              selected={clip.id === selectedClipId}
              onSelectClip={onSelectClip}
            />
          ))
        ) : (
          <span className="font-caption text-xs text-ink-faint">empty</span>
        )}
      </div>
    </section>
  );
}

function TimelineClipButton({
  clip,
  selected,
  onSelectClip,
}: {
  clip: TimelineClip;
  selected: boolean;
  onSelectClip: (clipId: string) => void;
}) {
  const component = clip.componentId ? getMotionComponent(clip.componentId) : null;
  const componentLabel = component?.label ?? clip.componentId ?? 'Clip';
  const seconds = motionSeconds(clip.durationFrames);
  const width = Math.max(112, Math.min(360, clip.durationFrames * 1.2));
  const body = clipBody(clip);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${componentLabel} clip`}
      onClick={() => onSelectClip(clip.id)}
      className={cn(
        'flex h-12 shrink-0 flex-col justify-center rounded-sm border px-2 text-left transition-colors duration-fast ease-quick',
        selected
          ? 'border-accent bg-accent/10 text-ink'
          : 'border-border-soft bg-surface-panel text-ink-dim hover:border-border hover:text-ink'
      )}
      style={{ width }}
    >
      <span className="truncate font-caption text-xs">{componentLabel}</span>
      <span className="flex min-w-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        {body ? <span className="truncate">{body}</span> : null}
        <span className="shrink-0">{seconds.toFixed(1)}s</span>
      </span>
    </button>
  );
}

function clipBody(clip: TimelineClip): string {
  if (typeof clip.props.headline === 'string') return clip.props.headline;
  if (typeof clip.props.narration === 'string') return clip.props.narration;
  if (typeof clip.props.text === 'string' && clip.componentId !== 'voice-line') {
    return clip.props.text;
  }
  if (typeof clip.props.status === 'string') return clip.props.status;
  if (typeof clip.props.role === 'string') return clip.props.role;
  return '';
}
