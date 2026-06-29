'use client';

import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { MotionRemotionPlayerPreview } from '@/components/workspace/MotionRemotionPlayerPreview';
import { Surface } from '@/components/ui/Surface';
import { getMotionComponent } from '@/lib/motion/componentRegistry';
import {
  MOTION_EFFECT_PRESETS,
  type MotionEffectPresetId,
} from '@/lib/motion/effectPresets';
import type { AgentMotionCapturePlan } from '@/lib/motion/capturePlan';
import type { MotionAgentExecutionHandoff } from '@/lib/motion/agentHandoff';
import type { MotionRenderEngine } from '@/lib/providers/video/types';
import type { MotionWorkflowExample } from '@/lib/motion/workflowExamples';
import type {
  MotionGraphNode,
  MotionWorkflowMode,
  TimelineClip,
  TimelineTrack,
} from '@/lib/motion/project';
import type { MotionDesignKitPlan } from '@/lib/motion/designKit';
import type { MotionWorkflowSkillDraft } from '@/lib/motion/workflowSkill';
import type { MotionCanvasMaterialPlan } from '@/lib/motion/canvasMaterial';
import type { MotionPreparedPreviewSource } from '@/lib/motion/start';
import type {
  MotionSourcePatchDraft,
  MotionSourcePatchDraftOption,
} from '@/lib/motion/sourcePatchDraft';
import type { MotionSourceKeyframe } from '@/lib/motion/revise';
import type {
  MotionProductionPlan,
  MotionProductionStep,
} from '@/lib/motion/productionPlan';
import { motionSeconds } from '@/lib/motion/project';
import type {
  MotionPreviewEnginePlan,
  MotionPreviewEditSource,
  MotionPreviewAgentRunbook,
  MotionPreviewCapabilitySetup,
  MotionPreviewDraftOption,
  MotionPreviewExecutionHistory,
  MotionPreviewExecutionHistoryEntry,
  MotionPreviewExportPackSummary,
  MotionPreviewPlan,
  MotionPreviewRegenerationAction,
  MotionPreviewRenderProofCanvasDropTarget,
  MotionPreviewRenderProofSummary,
  MotionPreviewSourceCaptureCandidate,
  MotionPreviewRuntimeTarget,
  MotionPreviewModeControl,
  MotionPreviewSourceProfile,
  MotionPreviewSyncBeat,
  MotionPreviewSyncEffectCue,
  MotionPreviewSyncSoundCue,
  MotionPreviewSyncSummary,
  MotionPreviewTimelineClip,
  MotionPreviewTimelineRow,
  MotionPreviewVideoPlan,
  MotionPreviewVideoPlanScene,
  MotionPreviewVisualGenerationEdge,
  MotionPreviewVisualGenerationSummary,
  MotionPreviewVisualSourcingSummary,
} from '@/lib/motion/previewPlan';
import { cn } from '@/lib/utils/cn';

export interface TimelineCaptureRunnerInput {
  kind: 'playwright-local';
  outputDir?: string;
  launchLocalApp?: boolean;
  headless?: boolean;
  timeoutMs?: number;
}

export interface TimelineCaptureActionOptions {
  captureRunner?: TimelineCaptureRunnerInput;
}

type EditableClipPropValue = string | number | boolean | null;

export interface TimelineLensProps {
  tracks: TimelineTrack[];
  previewPlan?: MotionPreviewPlan | null;
  preparedPreviewSource?: MotionPreparedPreviewSource | null;
  sourcePatchDraft?: MotionSourcePatchDraft | null;
  sourcePatchDraftOptions?: MotionSourcePatchDraftOption[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSelectDraft?: (draftId: string) => void;
  onSwitchWorkflowMode?: (mode: MotionWorkflowMode) => void;
  onRegenerateComponent?: (actionId: string) => void;
  onGenerateVoice?: () => void;
  onSyncMotion?: () => void;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
  onPreparePreviewSource?: (engine: MotionRenderEngine, draftId: string) => void;
  onApplySourcePatchDraft?: (draftId: string) => void;
  onAuthorSourcePatchDraft?: (draftId: string) => void;
  onApproveDraft?: (draftId: string) => void;
  onRunFullAuto?: () => void;
  onRunAgentTemplate?: (templateId: string) => void;
  onSelectCapabilitySetup?: (itemId: string) => void;
  onDropMotionPlanToCanvas?: (plan: MotionCanvasMaterialPlan) => void;
  onDropRenderProofToCanvas?: (target: MotionPreviewRenderProofCanvasDropTarget) => void;
  onExportPack?: () => void;
  onPlanVisuals?: (requestIds?: string[]) => void;
  onGenerateVideoClips?: (requestIds?: string[]) => void;
  onApplyGeneratedVideoTake?: (clipId: string, takeId: string) => void;
  onCaptureMotion?: (requestIds?: string[], options?: TimelineCaptureActionOptions) => void;
  onPinMotionSkill?: () => void;
  onEditClipSummary?: (clipId: string, summary: string) => void;
  onEditClipProps?: (clipId: string, props: Record<string, EditableClipPropValue>) => void;
  onEditClipSourceKeyframes?: (clipId: string, keyframes: MotionSourceKeyframe[]) => void;
  onEditClipEffect?: (clipId: string, effectPreset: MotionEffectPresetId) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
  capturePlan?: AgentMotionCapturePlan | null;
  agentHandoff?: MotionAgentExecutionHandoff | null;
  graphNodes?: MotionGraphNode[];
  workflowExamples?: MotionWorkflowExample[];
  workflowSkillDraft?: MotionWorkflowSkillDraft | null;
  actionStatus?: string | null;
}

export function TimelineLens({
  tracks,
  previewPlan,
  preparedPreviewSource = null,
  sourcePatchDraft = null,
  sourcePatchDraftOptions = [],
  selectedClipId,
  onSelectClip,
  onSelectDraft,
  onSwitchWorkflowMode,
  onRegenerateComponent,
  onGenerateVoice,
  onSyncMotion,
  onRenderMotion,
  onPreparePreviewSource,
  onApplySourcePatchDraft,
  onAuthorSourcePatchDraft,
  onApproveDraft,
  onRunFullAuto,
  onRunAgentTemplate,
  onSelectCapabilitySetup,
  onDropMotionPlanToCanvas,
  onDropRenderProofToCanvas,
  onExportPack,
  onPlanVisuals,
  onGenerateVideoClips,
  onApplyGeneratedVideoTake,
  onCaptureMotion,
  onPinMotionSkill,
  onEditClipSummary,
  onEditClipProps,
  onEditClipSourceKeyframes,
  onEditClipEffect,
  onEditClipTiming,
  capturePlan = null,
  agentHandoff = null,
  graphNodes = [],
  workflowExamples = [],
  workflowSkillDraft = null,
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
            preparedPreviewSource={preparedPreviewSource}
            sourcePatchDraft={sourcePatchDraft}
            sourcePatchDraftOptions={sourcePatchDraftOptions}
            selectedClipId={selectedClipId}
            onSelectClip={onSelectClip}
            onSelectDraft={onSelectDraft}
            onSwitchWorkflowMode={onSwitchWorkflowMode}
            onRegenerateComponent={onRegenerateComponent}
            onGenerateVoice={onGenerateVoice}
            onSyncMotion={onSyncMotion}
            onRenderMotion={onRenderMotion}
            onPreparePreviewSource={onPreparePreviewSource}
            onApplySourcePatchDraft={onApplySourcePatchDraft}
            onAuthorSourcePatchDraft={onAuthorSourcePatchDraft}
            onApproveDraft={onApproveDraft}
            onRunFullAuto={onRunFullAuto}
            onRunAgentTemplate={onRunAgentTemplate}
            onSelectCapabilitySetup={onSelectCapabilitySetup}
            onDropMotionPlanToCanvas={onDropMotionPlanToCanvas}
            onDropRenderProofToCanvas={onDropRenderProofToCanvas}
            onExportPack={onExportPack}
            onPlanVisuals={onPlanVisuals}
            onGenerateVideoClips={onGenerateVideoClips}
            onApplyGeneratedVideoTake={onApplyGeneratedVideoTake}
            onCaptureMotion={onCaptureMotion}
            onPinMotionSkill={onPinMotionSkill}
            onEditClipSummary={onEditClipSummary}
            onEditClipProps={onEditClipProps}
            onEditClipSourceKeyframes={onEditClipSourceKeyframes}
            onEditClipEffect={onEditClipEffect}
            onEditClipTiming={onEditClipTiming}
            capturePlan={capturePlan}
            agentHandoff={agentHandoff}
            graphNodes={graphNodes}
            workflowExamples={workflowExamples}
            workflowSkillDraft={workflowSkillDraft}
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
  preparedPreviewSource,
  sourcePatchDraft,
  sourcePatchDraftOptions,
  selectedClipId,
  onSelectClip,
  onSelectDraft,
  onSwitchWorkflowMode,
  onRegenerateComponent,
  onGenerateVoice,
  onSyncMotion,
  onRenderMotion,
  onPreparePreviewSource,
  onApplySourcePatchDraft,
  onAuthorSourcePatchDraft,
  onApproveDraft,
  onRunFullAuto,
  onRunAgentTemplate,
  onSelectCapabilitySetup,
  onDropMotionPlanToCanvas,
  onDropRenderProofToCanvas,
  onExportPack,
  onPlanVisuals,
  onGenerateVideoClips,
  onApplyGeneratedVideoTake,
  onCaptureMotion,
  onPinMotionSkill,
  onEditClipSummary,
  onEditClipProps,
  onEditClipSourceKeyframes,
  onEditClipEffect,
  onEditClipTiming,
  capturePlan,
  agentHandoff,
  graphNodes,
  workflowExamples,
  workflowSkillDraft,
  actionStatus,
}: {
  previewPlan: MotionPreviewPlan;
  preparedPreviewSource: MotionPreparedPreviewSource | null;
  sourcePatchDraft: MotionSourcePatchDraft | null;
  sourcePatchDraftOptions: MotionSourcePatchDraftOption[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSelectDraft?: (draftId: string) => void;
  onSwitchWorkflowMode?: (mode: MotionWorkflowMode) => void;
  onRegenerateComponent?: (actionId: string) => void;
  onGenerateVoice?: () => void;
  onSyncMotion?: () => void;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
  onPreparePreviewSource?: (engine: MotionRenderEngine, draftId: string) => void;
  onApplySourcePatchDraft?: (draftId: string) => void;
  onAuthorSourcePatchDraft?: (draftId: string) => void;
  onApproveDraft?: (draftId: string) => void;
  onRunFullAuto?: () => void;
  onRunAgentTemplate?: (templateId: string) => void;
  onSelectCapabilitySetup?: (itemId: string) => void;
  onDropMotionPlanToCanvas?: (plan: MotionCanvasMaterialPlan) => void;
  onDropRenderProofToCanvas?: (target: MotionPreviewRenderProofCanvasDropTarget) => void;
  onExportPack?: () => void;
  onPlanVisuals?: (requestIds?: string[]) => void;
  onGenerateVideoClips?: (requestIds?: string[]) => void;
  onApplyGeneratedVideoTake?: (clipId: string, takeId: string) => void;
  onCaptureMotion?: (requestIds?: string[], options?: TimelineCaptureActionOptions) => void;
  onPinMotionSkill?: () => void;
  onEditClipSummary?: (clipId: string, summary: string) => void;
  onEditClipProps?: (clipId: string, props: Record<string, EditableClipPropValue>) => void;
  onEditClipSourceKeyframes?: (clipId: string, keyframes: MotionSourceKeyframe[]) => void;
  onEditClipEffect?: (clipId: string, effectPreset: MotionEffectPresetId) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
  capturePlan: AgentMotionCapturePlan | null;
  agentHandoff: MotionAgentExecutionHandoff | null;
  graphNodes: MotionGraphNode[];
  workflowExamples: MotionWorkflowExample[];
  workflowSkillDraft: MotionWorkflowSkillDraft | null;
  actionStatus: string | null;
}) {
  const selectedClip = findPreviewClip(previewPlan, selectedClipId);
  const renderEngine = preferredRenderEngine(previewPlan.enginePreviews);
  const currentDraft = previewPlan.draftOptions.find((draft) => draft.isCurrent) ?? null;
  const [advancedNodeLensOpen, setAdvancedNodeLensOpen] = useState(false);

  useEffect(() => {
    setAdvancedNodeLensOpen(false);
  }, [previewPlan.id]);

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

      <section className="border-b border-border-soft px-4 py-3">
        <MotionModeControlStrip
          modeControl={previewPlan.modeControl}
          onSwitchWorkflowMode={onSwitchWorkflowMode}
        />
      </section>

      <section className="grid gap-3 border-b border-border-soft px-4 py-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            drafts
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {previewPlan.draftOptions.map((draft) => (
              <MotionDraftOptionCard
                key={draft.draftId}
                draft={draft}
                onSelectDraft={onSelectDraft}
              />
            ))}
          </div>
          {currentDraft ? (
            <button
              type="button"
              disabled={!onApproveDraft || currentDraft.status === 'approved'}
              onClick={() => onApproveDraft?.(currentDraft.draftId)}
              className={cn(
                'mt-2 rounded-sm border px-3 py-1.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                onApproveDraft && currentDraft.status !== 'approved'
                  ? 'border-accent/50 bg-accent/10 text-accent hover:border-accent hover:text-ink'
                  : 'cursor-default border-border-soft bg-surface-panel text-ink-faint'
              )}
            >
              {currentDraft.status === 'approved' ? 'current draft approved' : 'approve current draft'}
            </button>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            engines
          </div>
          <div className="grid gap-1.5">
            {previewPlan.enginePreviews.map((engine) => (
              <EnginePreviewRow
                key={engine.engine}
                engine={engine}
                onRenderMotion={onRenderMotion}
              />
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
            <VisualSourcingSummaryRow summary={previewPlan.visualSourcingSummary} />
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
                onPlanVisuals={onPlanVisuals}
                onGenerateVideoClips={onGenerateVideoClips}
              />
            ) : null}
            {onPinMotionSkill ? (
              <PinMotionSkillButton onPinMotionSkill={onPinMotionSkill} />
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionPlayablePreviewStrip
          previewPlan={previewPlan}
          preparedPreviewSource={preparedPreviewSource}
          selectedClipId={selectedClipId}
          onSelectClip={onSelectClip}
          onPreparePreviewSource={onPreparePreviewSource}
          onApplyGeneratedVideoTake={onApplyGeneratedVideoTake}
          onRegenerateComponent={onRegenerateComponent}
        />
      </section>

      {graphNodes.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionGraphStrip nodes={graphNodes} />
        </section>
      ) : null}

      {workflowSkillDraft ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionWorkflowSkillStrip
            draft={workflowSkillDraft}
            handoff={agentHandoff}
            onRunAgentTemplate={onRunAgentTemplate}
          />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionInteractiveDemoStrip summary={previewPlan.interactiveDemo} />
      </section>

      {previewPlan.agentRunbook ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionAgentPlanStrip runbook={previewPlan.agentRunbook} />
        </section>
      ) : null}

      {agentHandoff ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionAgentActionsStrip
            handoff={agentHandoff}
            onRunFullAuto={onRunFullAuto}
            onRunAgentTemplate={onRunAgentTemplate}
          />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionProductionQueueStrip
          plan={previewPlan.productionPlan}
          executionHistory={previewPlan.executionHistory}
        />
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionCanvasMaterialStrip
          plan={previewPlan.canvasMaterialPlan}
          onDropMotionPlanToCanvas={onDropMotionPlanToCanvas}
        />
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionRenderProofStrip
          summary={previewPlan.renderProofSummary}
          onDropRenderProofToCanvas={onDropRenderProofToCanvas}
        />
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionCapabilitySetupStrip
          setup={previewPlan.capabilitySetup}
          onSelectCapabilitySetup={onSelectCapabilitySetup}
        />
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionEditSourceStrip editSource={previewPlan.editSource} />
      </section>

      {sourcePatchDraftOptions.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionSourcePatchDraftOptionsStrip
            drafts={sourcePatchDraftOptions}
            onApplySourcePatchDraft={onApplySourcePatchDraft}
            onAuthorSourcePatchDraft={onAuthorSourcePatchDraft}
          />
        </section>
      ) : sourcePatchDraft ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionSourcePatchDraftStrip
            draft={sourcePatchDraft}
            onApplySourcePatchDraft={onApplySourcePatchDraft}
          />
        </section>
      ) : null}

      {previewPlan.sourceProfile ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionSourceMaterialStrip
            sourceProfile={previewPlan.sourceProfile}
            captureRunner={captureRunnerFromAgentHandoff(agentHandoff)}
            onCaptureMotion={onCaptureMotion}
          />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionDesignKitStrip kit={previewPlan.designKit} />
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionReferenceGrammarStrip grammar={previewPlan.referenceGrammar} />
      </section>

      {previewPlan.referenceSignals.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionReferenceSignalsStrip
            signals={previewPlan.referenceSignals}
            onRegenerateComponent={onRegenerateComponent}
          />
        </section>
      ) : null}

      {previewPlan.tasteReferences.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionTasteReferencesStrip
            references={previewPlan.tasteReferences}
            onRegenerateComponent={onRegenerateComponent}
          />
        </section>
      ) : null}

      {capturePlan ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionCapturePlanView
            capturePlan={capturePlan}
            captureRunner={captureRunnerFromAgentHandoff(agentHandoff)}
            onCaptureMotion={onCaptureMotion}
          />
        </section>
      ) : null}

      <section className="border-b border-border-soft px-4 py-3">
        <MotionVisualSourcingStrip summary={previewPlan.visualSourcingSummary} />
      </section>

      <section className="border-b border-border-soft px-4 py-3">
        <MotionVisualGenerationStrip
          summary={previewPlan.visualGenerationSummary}
          onGenerateVideoClips={onGenerateVideoClips}
          onApplyGeneratedVideoTake={onApplyGeneratedVideoTake}
          onOpenNodeLens={() => setAdvancedNodeLensOpen(true)}
        />
      </section>

      {advancedNodeLensOpen ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionGenerationNodeLens
            previewPlan={previewPlan}
            onPlanVisuals={onPlanVisuals}
            onGenerateVideoClips={onGenerateVideoClips}
            onGenerateVoice={onGenerateVoice}
            onSyncMotion={onSyncMotion}
            onRenderMotion={onRenderMotion}
            onExportPack={onExportPack}
          />
        </section>
      ) : null}

      {previewPlan.syncBeats.length > 0 ||
      previewPlan.syncSoundCues.length > 0 ||
      previewPlan.syncEffectCues.length > 0 ? (
        <section className="border-b border-border-soft px-4 py-3">
          <MotionSyncPlanStrip
            status={previewPlan.syncSummary.status}
            beats={previewPlan.syncBeats}
            soundCues={previewPlan.syncSoundCues}
            effectCues={previewPlan.syncEffectCues}
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
          onEditClipProps={onEditClipProps}
          onEditClipSourceKeyframes={onEditClipSourceKeyframes}
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
              executionEntry={findRegenerationExecutionEntry(action, previewPlan.executionHistory)}
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

function MotionDraftOptionCard({
  draft,
  onSelectDraft,
}: {
  draft: MotionPreviewDraftOption;
  onSelectDraft?: (draftId: string) => void;
}) {
  const roleLabel = draft.roles.map(readableLabel).join(' / ');
  const canChoose = Boolean(onSelectDraft) && !draft.isCurrent;

  return (
    <button
      type="button"
      aria-pressed={draft.isCurrent}
      disabled={!canChoose}
      onClick={() => onSelectDraft?.(draft.draftId)}
      className={cn(
        'flex min-w-[210px] max-w-[240px] flex-col rounded-sm border px-3 py-2 text-left transition-colors duration-fast ease-quick',
        draft.isCurrent
          ? 'border-accent bg-accent/10 text-ink'
          : 'border-border-soft bg-surface-panel text-ink-dim hover:border-border hover:text-ink',
        !canChoose && !draft.isCurrent ? 'cursor-default opacity-70' : ''
      )}
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 truncate font-caption text-xs">{draft.label}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          {draft.isCurrent ? 'current' : draft.status.replace(/-/g, ' ')}
        </span>
      </span>
      <span className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
        {draft.angle}
      </span>
      <span className="mt-2 flex flex-wrap gap-1">
        <Chip tone="neutral" size="sm">
          {formatPreviewDuration(draft.durationSeconds)}
        </Chip>
        {roleLabel ? (
          <Chip tone="neutral" size="sm">
            {roleLabel}
          </Chip>
        ) : null}
      </span>
      <span className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-dim">
        {draft.isCurrent ? 'editing this cut' : 'choose draft'}
      </span>
    </button>
  );
}

function MotionPlayablePreviewStrip({
  previewPlan,
  preparedPreviewSource,
  selectedClipId,
  onSelectClip,
  onPreparePreviewSource,
  onApplyGeneratedVideoTake,
  onRegenerateComponent,
}: {
  previewPlan: MotionPreviewPlan;
  preparedPreviewSource: MotionPreparedPreviewSource | null;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onPreparePreviewSource?: (engine: MotionRenderEngine, draftId: string) => void;
  onApplyGeneratedVideoTake?: (clipId: string, takeId: string) => void;
  onRegenerateComponent?: (actionId: string) => void;
}) {
  const sourcePreview = buildSourcePreview(previewPlan);
  const [previewSeconds, setPreviewSeconds] = useState(0);

  useEffect(() => {
    setPreviewSeconds(0);
  }, [sourcePreview?.compositionId, sourcePreview?.durationSeconds]);

  if (!sourcePreview) {
    return (
      <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
        <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          playable preview
        </div>
        <div className="mt-1 font-caption text-xs text-ink-faint">
          Prepare a Remotion or HyperFrames source bundle to preview edits here.
        </div>
      </div>
    );
  }

  const clampedSeconds = Math.min(previewSeconds, sourcePreview.durationSeconds);
  const activeComponent =
    sourcePreview.components.find((component) => component.clipId === selectedClipId) ??
    sourcePreview.components.find(
      (component) =>
        clampedSeconds >= component.startSeconds &&
        clampedSeconds < component.startSeconds + component.durationSeconds
    ) ??
    sourcePreview.components[0] ??
    null;
  const preparedSource = preparedPreviewMatchesSource(
    preparedPreviewSource,
    sourcePreview,
    previewPlan
  )
    ? preparedPreviewSource
    : null;

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              playable preview
            </div>
            <div className="mt-1 truncate font-caption text-xs text-ink">
              {sourcePreview.engine} source preview
            </div>
          </div>
          <Chip tone="info" size="sm">
            source-backed edits
          </Chip>
        </div>

        <div
          role="group"
          aria-label="source-backed motion preview"
          className="mt-3 flex aspect-video min-h-[180px] flex-col justify-between overflow-hidden rounded-sm border border-border-soft bg-surface-canvas p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-caption text-sm text-ink">
                {activeComponent?.componentLabel ?? sourcePreview.title}
              </div>
              <div className="mt-1 line-clamp-2 font-caption text-xs text-ink-faint">
                {activeComponent?.summary ?? sourcePreview.compositionId}
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-2xs uppercase tracking-wide text-ink-faint">
              {formatPreviewTime(clampedSeconds)} / {formatPreviewDuration(sourcePreview.durationSeconds)}
            </div>
          </div>

          <div className="mt-3 rounded-sm border border-border-soft bg-surface-panel/60 px-2 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-caption text-xs text-ink">
                {sourcePreview.runtimePreview.label} target
              </div>
              <Chip tone="info" size="sm">
                {sourcePreview.runtimePreview.mountLabel}
              </Chip>
            </div>
            <div className="mt-1 truncate font-caption text-2xs text-ink-dim">
              {summarizeRuntimeEditLinks(sourcePreview.runtimePreview)}
            </div>
            <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
              {sourcePreview.runtimePreview.sourceHostRequirement}
            </div>
            {onPreparePreviewSource ? (
              <button
                type="button"
                onClick={() => onPreparePreviewSource(sourcePreview.engine, previewPlan.draftId)}
                className="mt-2 w-full rounded-sm border border-border-soft bg-surface-canvas px-3 py-2 text-left font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink"
              >
                prepare {sourcePreview.engine} preview source
              </button>
            ) : null}
          </div>

          {preparedSource ? (
            <MotionPreparedPreviewRuntimeHost
              source={preparedSource}
              selectedClipId={selectedClipId}
            />
          ) : null}

          <div className="mt-4 grid gap-1">
            <input
              type="range"
              min="0"
              max={sourcePreview.durationSeconds}
              step="0.1"
              aria-label="preview frame scrubber"
              value={clampedSeconds}
              onChange={(event) => setPreviewSeconds(Number(event.currentTarget.value))}
              className="w-full accent-current"
            />
            <div className="flex flex-wrap items-center gap-1">
              <Chip tone="neutral" size="sm">
                {sourcePreview.compositionId}
              </Chip>
              <Chip tone="neutral" size="sm">
                {sourcePreview.entryPoint}
              </Chip>
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
        <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          preview controls
        </div>
        <div className="mt-2 grid gap-2">
          {sourcePreview.components.slice(0, 4).map((component) => {
            const selected = component.clipId === selectedClipId;
            return (
              <div
                key={component.clipId}
                role="group"
                aria-label={`${component.componentLabel} preview control`}
                className={cn(
                  'rounded-sm border px-3 py-2 text-left transition-colors duration-fast ease-quick',
                  selected
                    ? 'border-accent bg-accent/10 text-ink'
                    : 'border-border-soft bg-surface-canvas text-ink-dim hover:border-border hover:text-ink'
                )}
              >
                <button
                  type="button"
                  aria-label={`focus ${component.componentLabel}`}
                  aria-pressed={selected}
                  onClick={() => onSelectClip(component.clipId)}
                  className="w-full text-left"
                >
                  <div className="truncate font-caption text-xs">{component.componentLabel}</div>
                  <div className="mt-1 truncate font-caption text-2xs text-ink-faint">
                    {component.editControlLabels.slice(0, 3).join(' / ') || 'timeline edit'}
                  </div>
                </button>
                {component.generatedTakeLabel ? (
                  <div className="mt-1 truncate font-caption text-2xs text-ink-dim">
                    {component.generatedTakeLabel}
                  </div>
                ) : null}
                {component.pendingGeneratedTakes.length > 0 ? (
                  <div className="mt-2 grid gap-1">
                    {component.pendingGeneratedTakes.slice(0, 2).map((take) => (
                      <button
                        key={take.takeId}
                        type="button"
                        onClick={() =>
                          onApplyGeneratedVideoTake?.(component.clipId, take.takeId)
                        }
                        disabled={!onApplyGeneratedVideoTake}
                        aria-label={`use ${take.providerLabel} take`}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 text-left transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate font-caption text-2xs">
                          {take.providerLabel}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                          {take.mimeType.replace('video/', '')}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {component.regenerationActions.length > 0 ? (
                  <div className="mt-2 grid gap-1">
                    {component.regenerationActions.slice(0, 2).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => onRegenerateComponent?.(action.id)}
                        disabled={!onRegenerateComponent}
                        className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 text-left font-caption text-2xs transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid gap-1 font-caption text-2xs text-ink-faint">
          <div>{sourcePreview.sourceFileSummary}</div>
          <div>{sourcePreview.editSurfaceSummary}</div>
        </div>
      </div>
    </div>
  );
}

function MotionPreparedPreviewRuntimeHost({
  source,
  selectedClipId,
}: {
  source: MotionPreparedPreviewSource;
  selectedClipId: string | null;
}) {
  const sourceFileCount = source.sourceHost.sourceFileCount || source.sourceFiles.length;
  const sourcePaths = uniqueLabels([
    source.sourceHost.entryPath,
    source.sourceHost.timelinePath,
    source.sourceHost.manifestPath,
  ].filter((path): path is string => Boolean(path)));
  const editLinks = source.editLinkLabels.slice(0, 3).join(' / ');
  const hyperframesHtml = hyperframesPreviewHtml(source);
  const runtimeHost = source.runtimeHost;
  const runtimeStatusLabel = formatPreparedRuntimeStatus(runtimeHost.status);

  return (
    <div
      role="group"
      aria-label={`prepared ${source.engine} preview runtime`}
      className="mt-3 rounded-sm border border-accent/40 bg-surface-panel/70 px-2 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          runtime host
        </div>
        <Chip tone="ok" size="sm">
          source ready
        </Chip>
      </div>
      <div className="mt-1 truncate font-caption text-xs text-ink">
        {source.label} source ready
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip tone="neutral" size="sm">
          {sourceFileCount} source files
        </Chip>
        <Chip tone="neutral" size="sm">
          {source.fps} fps
        </Chip>
        <Chip tone="neutral" size="sm">
          {formatPreviewDuration(source.durationSeconds)}
        </Chip>
      </div>
      <div className="mt-2 grid gap-1 font-caption text-2xs text-ink-faint">
        {sourcePaths.slice(0, 3).map((path) => (
          <div key={path} className="truncate">
            {path}
          </div>
        ))}
        {editLinks ? <div className="truncate text-ink-dim">{editLinks}</div> : null}
      </div>
      <div className="mt-2 rounded-sm border border-border-soft bg-surface-canvas/70 px-2 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-caption text-2xs uppercase tracking-wide text-ink-dim">
            preview surface
          </div>
          <Chip tone={runtimeHost.status === 'embedded-preview' ? 'ok' : 'info'} size="sm">
            {runtimeStatusLabel}
          </Chip>
        </div>
        {runtimeHost.dependencyLabels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {runtimeHost.dependencyLabels.map((label) => (
              <Chip key={label} tone="neutral" size="sm">
                {label}
              </Chip>
            ))}
          </div>
        ) : null}
        {runtimeHost.adapterRequirement ? (
          <div className="mt-2 font-caption text-2xs text-ink-faint">
            {runtimeHost.adapterRequirement}
          </div>
        ) : null}
      </div>
      {hyperframesHtml ? (
        <iframe
          title={`${source.label} preview`}
          srcDoc={hyperframesHtml}
          sandbox="allow-scripts"
          className="mt-3 aspect-video w-full rounded-sm border border-border-soft bg-surface-canvas"
        />
      ) : null}
      {source.runtimeKind === 'remotion-player' && runtimeHost.status === 'source-ready' ? (
        <MotionRemotionPlayerPreview source={source} selectedClipId={selectedClipId} />
      ) : null}
    </div>
  );
}

function hyperframesPreviewHtml(source: MotionPreparedPreviewSource): string | null {
  if (source.runtimeKind !== 'hyperframes-iframe') return null;
  const entryPath = source.sourceHost.entryPath ?? source.entryPoint;
  const entryFile =
    source.sourceFiles.find(
      (file) => file.kind === 'entry' && file.mimeType === 'text/html'
    ) ??
    source.sourceFiles.find(
      (file) => file.path === entryPath && file.mimeType.includes('html')
    );

  return entryFile?.contents ?? null;
}

function formatPreparedRuntimeStatus(status: MotionPreparedPreviewSource['runtimeHost']['status']): string {
  if (status === 'needs-player-adapter') return 'player adapter needed';
  if (status === 'embedded-preview') return 'embedded preview';
  return 'source ready';
}

interface MotionSourcePreviewComponent {
  clipId: string;
  componentLabel: string;
  summary: string;
  startSeconds: number;
  durationSeconds: number;
  editControlLabels: string[];
  generatedTakeLabel: string | null;
  pendingGeneratedTakes: MotionSourcePreviewGeneratedTake[];
  regenerationActions: MotionSourcePreviewRegenerationAction[];
}

interface MotionSourcePreviewGeneratedTake {
  takeId: string;
  providerLabel: string;
  mimeType: string;
}

interface MotionSourcePreviewRegenerationAction {
  id: string;
  label: string;
}

interface MotionSourcePreview {
  title: string;
  engine: MotionRenderEngine;
  compositionId: string;
  entryPoint: string;
  durationSeconds: number;
  runtimePreview: MotionPreviewRuntimeTarget;
  sourceFileSummary: string;
  editSurfaceSummary: string;
  components: MotionSourcePreviewComponent[];
}

function buildSourcePreview(previewPlan: MotionPreviewPlan): MotionSourcePreview | null {
  const engine = preferredRenderEngine(previewPlan.enginePreviews);
  const editSource = previewPlan.editSource;
  if (
    !engine ||
    !engine.compositionId ||
    !engine.entryPoint ||
    !engine.runtimePreview ||
    editSource.status !== 'ready'
  ) {
    return null;
  }

  const components = editSource.components.map((component) => {
    const clip = findClipById(previewPlan, component.clipId);
    const generatedTakeState = generatedTakeStateForComponent(previewPlan, component.clipId);
    return {
      clipId: component.clipId,
      componentLabel: component.componentLabel,
      summary: clip?.summary ?? component.editSurfaceLabels.slice(0, 3).join(' / '),
      startSeconds: clip?.startSeconds ?? 0,
      durationSeconds: clip?.durationSeconds ?? Math.min(3, engine.durationSeconds),
      editControlLabels: component.editControlLabels,
      generatedTakeLabel: generatedTakeLabelForState(generatedTakeState),
      pendingGeneratedTakes: generatedTakeState.pendingTakes,
      regenerationActions: previewPlan.regenerationActions
        .filter((action) => action.clipId === component.clipId)
        .map((action) => ({
          id: action.id,
          label: previewControlRegenerationLabel(action.label, component.componentLabel),
        })),
    };
  });

  return {
    title: previewPlan.title,
    engine: engine.engine,
    compositionId: engine.compositionId,
    entryPoint: engine.entryPoint,
    durationSeconds: engine.durationSeconds,
    runtimePreview: engine.runtimePreview,
    sourceFileSummary: summarizePreviewSourceFiles(editSource),
    editSurfaceSummary: summarizePreviewEditSurfaces(editSource),
    components,
  };
}

function preparedPreviewMatchesSource(
  preparedSource: MotionPreparedPreviewSource | null,
  sourcePreview: MotionSourcePreview,
  previewPlan: MotionPreviewPlan
): preparedSource is MotionPreparedPreviewSource {
  return Boolean(
    preparedSource &&
      preparedSource.draftId === previewPlan.draftId &&
      preparedSource.engine === sourcePreview.engine &&
      preparedSource.compositionId === sourcePreview.compositionId
  );
}

function findClipById(
  previewPlan: MotionPreviewPlan,
  clipId: string
): MotionPreviewTimelineClip | null {
  for (const row of previewPlan.timelineRows) {
    const clip = row.clips.find((candidate) => candidate.clipId === clipId);
    if (clip) return clip;
  }
  return null;
}

function generatedTakeStateForComponent(
  previewPlan: MotionPreviewPlan,
  clipId: string
): {
  pendingTakeLabels: string[];
  selectedTakeLabels: string[];
  pendingTakes: MotionSourcePreviewGeneratedTake[];
} {
  const request = previewPlan.visualGenerationSummary.requests.find(
    (candidate) => candidate.clipId === clipId
  );
  if (!request) {
    return {
      pendingTakeLabels: [],
      selectedTakeLabels: [],
      pendingTakes: [],
    };
  }

  return {
    pendingTakeLabels: request.pendingTakeLabels ?? [],
    selectedTakeLabels: request.selectedTakeLabels ?? [],
    pendingTakes: (request.pendingTakes ?? []).map((take) => ({
      takeId: take.takeId,
      providerLabel: take.providerLabel,
      mimeType: take.mimeType,
    })),
  };
}

function generatedTakeLabelForState(state: {
  pendingTakeLabels: string[];
  selectedTakeLabels: string[];
}): string | null {
  const pendingTakeLabels = state.pendingTakeLabels;
  const selectedTakeLabels = state.selectedTakeLabels;

  if (pendingTakeLabels.length > 0) {
    return `pending take: ${pendingTakeLabels.slice(0, 2).join(' / ')}`;
  }

  if (selectedTakeLabels.length > 0) {
    return `selected take: ${selectedTakeLabels.slice(0, 2).join(' / ')}`;
  }

  return null;
}

function previewControlRegenerationLabel(label: string, componentLabel: string): string {
  const suffix = ` for ${componentLabel}`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

function summarizePreviewSourceFiles(editSource: MotionPreviewEditSource): string {
  const importantPaths = [editSource.scriptPath, editSource.storyboardPath].filter(
    (path): path is string => Boolean(path)
  );
  if (importantPaths.length > 0) return importantPaths.join(' / ');
  return editSource.sourceFilePaths.slice(0, 2).join(' / ') || 'source bundle pending';
}

function summarizePreviewEditSurfaces(editSource: MotionPreviewEditSource): string {
  const labels = uniqueLabels(
    editSource.components.flatMap((component) => component.editSurfaceLabels)
  ).slice(0, 5);
  return labels.length > 0 ? labels.join(' / ') : 'timeline / component / effect';
}

function summarizeRuntimeEditLinks(runtimePreview: MotionPreviewRuntimeTarget): string {
  return runtimePreview.editLinkLabels.slice(0, 3).join(' / ') || 'timeline / component / effect';
}

function formatPreviewTime(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function formatPreviewDuration(seconds: number): string {
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

function uniqueLabels(labels: string[]): string[] {
  return Array.from(new Set(labels.filter((label) => label.trim().length > 0)));
}

function readableLabel(value: string): string {
  return value.replace(/[-_]/g, ' ');
}

function MotionModeControlStrip({
  modeControl,
  onSwitchWorkflowMode,
}: {
  modeControl: MotionPreviewModeControl;
  onSwitchWorkflowMode?: (mode: MotionWorkflowMode) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          workflow mode
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Chip tone={modeControl.currentMode === 'full-auto' ? 'ok' : 'info'} size="sm">
            {modeControl.currentLabel}
          </Chip>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {modeControl.options.map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={option.status === 'active' || !onSwitchWorkflowMode}
            onClick={() => onSwitchWorkflowMode?.(option.mode)}
            className={cn(
              'min-w-0 rounded-sm border px-3 py-2 text-left transition-colors duration-fast ease-quick',
              option.status === 'active'
                ? 'border-accent/50 bg-accent/10'
                : 'border-border-soft bg-surface-panel',
              option.status === 'available' && onSwitchWorkflowMode
                ? 'hover:border-accent hover:text-accent'
                : 'cursor-default'
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-caption text-xs text-ink">{option.label}</div>
                <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
                  {option.actionLabel}
                </div>
              </div>
              <Chip tone={option.status === 'active' ? 'info' : 'neutral'} size="sm">
                {option.status === 'active' ? 'selected' : 'available'}
              </Chip>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {option.gateLabels.slice(0, 3).map((label) => (
                <Chip key={label} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
            </div>
            <div className="mt-2 truncate font-caption text-2xs text-ink-faint">
              {option.route}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MotionAgentPlanStrip({
  runbook,
}: {
  runbook: MotionPreviewAgentRunbook;
}) {
  const nextStep = runbook.steps.find((step) => step.stepId === runbook.nextStepId);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            agent plan
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {runbook.nextStepLabel ?? 'ready for export'}
          </div>
        </div>
        <Chip tone={runbook.mode === 'full-auto' ? 'ok' : 'info'} size="sm">
          {runbook.mode === 'full-auto'
            ? `${runbook.autoAdvanceCount} auto steps`
            : `${runbook.reviewRequiredCount} review gates`}
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="grid gap-1.5">
            {runbook.steps.map((step) => (
              <MotionAgentPlanStepRow
                key={step.stepId}
                step={step}
                isNext={step.stepId === runbook.nextStepId}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">
            {runbook.mode === 'full-auto' ? 'full auto' : 'review'} gates
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {runbook.verificationLabels.slice(0, 4).map((label) => (
              <Chip key={label} tone="neutral" size="sm">
                {label}
              </Chip>
            ))}
          </div>
          {nextStep ? (
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {nextStep.routeLabels.join(' / ')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MotionAgentPlanStepRow({
  step,
  isNext,
}: {
  step: MotionPreviewAgentRunbook['steps'][number];
  isNext: boolean;
}) {
  const chipLabel = isNext ? 'next' : step.autoAdvance ? 'auto' : step.reviewRequired ? 'review' : 'ready';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_74px] items-center gap-2">
      <div className="min-w-0">
        <div className="truncate font-caption text-xs text-ink">{step.label}</div>
        <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
          {isNext ? step.routeLabels.join(' / ') : step.artifactLabels.slice(0, 2).join(' / ')}
        </div>
      </div>
      <Chip tone={isNext ? 'info' : step.autoAdvance ? 'ok' : 'neutral'} size="sm">
        {chipLabel}
      </Chip>
    </div>
  );
}

function MotionAgentActionsStrip({
  handoff,
  onRunFullAuto,
  onRunAgentTemplate,
}: {
  handoff: MotionAgentExecutionHandoff;
  onRunFullAuto?: () => void;
  onRunAgentTemplate?: (templateId: string) => void;
}) {
  const nextTemplate =
    handoff.templates.find((template) => template.id === handoff.nextTemplateId) ??
    handoff.templates[0] ??
    null;
  const visibleTemplates = handoff.templates.slice(0, 4);
  const canRunFullAuto =
    handoff.mode === 'full-auto' &&
    nextTemplate?.route === '/api/motion/full-auto' &&
    Boolean(onRunFullAuto);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            agent actions
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {nextTemplate ? nextTemplate.label : 'ready for review'}
          </div>
        </div>
        <Chip tone={handoff.mode === 'full-auto' ? 'ok' : 'info'} size="sm">
          {handoff.mode === 'full-auto' ? 'full auto' : 'review'}
        </Chip>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="grid gap-1.5">
            {visibleTemplates.map((template) => (
              <MotionAgentActionTemplateRow
                key={template.id}
                template={template}
                isNext={template.id === handoff.nextTemplateId}
                onRunAgentTemplate={onRunAgentTemplate}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">
            {handoff.templates.length}{' '}
            {handoff.templates.length === 1 ? 'action' : 'actions'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {nextTemplate ? (
              <Chip tone="info" size="sm">
                next
              </Chip>
            ) : null}
            {handoff.sourceLabels.slice(0, 2).map((label) => (
              <Chip key={label} tone="neutral" size="sm">
                {label}
              </Chip>
            ))}
          </div>
          {nextTemplate ? (
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {nextTemplate.expectedReceipts.slice(0, 3).join(' / ')}
            </div>
          ) : null}
          {canRunFullAuto ? (
            <button
              type="button"
              onClick={onRunFullAuto}
              className="mt-2 w-full rounded-sm border border-border-soft bg-surface-canvas px-3 py-2 text-left font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink"
            >
              run full auto
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MotionAgentActionTemplateRow({
  template,
  isNext,
  onRunAgentTemplate,
}: {
  template: MotionAgentExecutionHandoff['templates'][number];
  isNext: boolean;
  onRunAgentTemplate?: (templateId: string) => void;
}) {
  const receiptLabel = template.expectedReceipts.slice(0, 2).join(' / ');
  const hasLocalRunner = templateHasLocalRunner(template);
  const content = (
    <>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="truncate font-caption text-xs text-ink">{template.label}</span>
          {hasLocalRunner ? (
            <Chip tone="info" size="sm">
              local runner
            </Chip>
          ) : null}
        </div>
        <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
          {template.route}
        </div>
        {receiptLabel ? (
          <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
            {receiptLabel}
          </div>
        ) : null}
      </div>
      <Chip tone={isNext ? 'info' : 'neutral'} size="sm">
        {isNext ? 'next' : template.method.toLowerCase()}
      </Chip>
    </>
  );

  if (onRunAgentTemplate) {
    return (
      <button
        type="button"
        onClick={() => onRunAgentTemplate(template.id)}
        aria-label={`run ${template.label} agent action`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm text-left transition-colors duration-fast ease-quick hover:text-accent"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      {content}
    </div>
  );
}

function templateHasLocalRunner(template: MotionAgentExecutionHandoff['templates'][number]) {
  const runner = template.body.captureRunner;
  return (
    typeof runner === 'object' &&
    runner !== null &&
    'kind' in runner &&
    runner.kind === 'playwright-local'
  );
}

function captureRunnerFromAgentHandoff(
  handoff: MotionAgentExecutionHandoff | null
): TimelineCaptureRunnerInput | undefined {
  const template =
    handoff?.templates.find((candidate) => candidate.route === '/api/motion/capture') ??
    handoff?.templates.find((candidate) => candidate.body.captureRunner);
  const runner = template?.body.captureRunner;
  if (!isTimelineCaptureRunnerInput(runner)) return undefined;

  return {
    kind: runner.kind,
    ...(runner.outputDir ? { outputDir: runner.outputDir } : {}),
    ...(typeof runner.launchLocalApp === 'boolean'
      ? { launchLocalApp: runner.launchLocalApp }
      : {}),
    ...(typeof runner.headless === 'boolean' ? { headless: runner.headless } : {}),
    ...(typeof runner.timeoutMs === 'number' ? { timeoutMs: runner.timeoutMs } : {}),
  };
}

function isTimelineCaptureRunnerInput(value: unknown): value is TimelineCaptureRunnerInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const runner = value as Record<string, unknown>;

  return (
    runner.kind === 'playwright-local' &&
    (runner.outputDir === undefined || typeof runner.outputDir === 'string') &&
    (runner.launchLocalApp === undefined || typeof runner.launchLocalApp === 'boolean') &&
    (runner.headless === undefined || typeof runner.headless === 'boolean') &&
    (runner.timeoutMs === undefined || typeof runner.timeoutMs === 'number')
  );
}

function MotionProductionQueueStrip({
  plan,
  executionHistory,
}: {
  plan: MotionProductionPlan;
  executionHistory: MotionPreviewExecutionHistory;
}) {
  const latestReceiptLabels = executionHistory.latestReceiptLabels.slice(0, 2).join(' / ');

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            production queue
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {plan.nextActionLabel ?? 'ready to package'}
          </div>
        </div>
        <Chip tone={plan.status === 'blocked' ? 'warn' : plan.status === 'complete' ? 'ok' : 'info'} size="sm">
          {plan.completeCount}/{plan.steps.length}
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="grid gap-1.5">
            {plan.steps.slice(0, 6).map((step) => (
              <MotionProductionStepRow key={step.id} step={step} isNext={step.id === plan.nextStepId} />
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">
            {plan.mode === 'full-auto' ? 'full auto' : 'review'} flow
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Chip tone="neutral" size="sm">
              {plan.readyCount} ready
            </Chip>
            <Chip tone="neutral" size="sm">
              {plan.blockedCount} blocked
            </Chip>
            {plan.optionalCount > 0 ? (
              <Chip tone="neutral" size="sm">
                {plan.optionalCount} optional
              </Chip>
            ) : null}
          </div>
          {plan.blockerLabels.length > 0 ? (
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {plan.blockerLabels[0]}
            </div>
          ) : null}
          {executionHistory.status === 'saved' ? (
            <div className="mt-2 border-t border-border-soft pt-2">
              <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
                saved receipts
              </div>
              <div className="mt-1 font-caption text-xs text-ink">
                {executionHistory.receiptCount}{' '}
                {executionHistory.receiptCount === 1 ? 'receipt' : 'receipts'}
              </div>
              {latestReceiptLabels ? (
                <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
                  {latestReceiptLabels}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MotionCanvasMaterialStrip({
  plan,
  onDropMotionPlanToCanvas,
}: {
  plan: MotionCanvasMaterialPlan;
  onDropMotionPlanToCanvas?: (plan: MotionCanvasMaterialPlan) => void;
}) {
  const visibleCards = plan.cards.slice(0, 4);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            video plan
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {plan.materialCount} canvas cards
          </div>
        </div>
        <Chip tone="info" size="sm">
          canvas
        </Chip>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
          {visibleCards.map((card) => (
            <div
              key={card.id}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="truncate font-caption text-xs text-ink">{card.label}</div>
                <Chip tone={motionCanvasCardTone(card.kind)} size="sm">
                  {card.statusLabel}
                </Chip>
              </div>
              <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
                {card.body}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {plan.summaryLabels.slice(0, 4).map((label) => (
              <Chip key={label} tone="neutral" size="sm">
                {label}
              </Chip>
            ))}
          </div>
          {onDropMotionPlanToCanvas ? (
            <button
              type="button"
              onClick={() => onDropMotionPlanToCanvas(plan)}
              className="mt-2 w-full rounded-sm border border-border-soft bg-surface-canvas px-3 py-2 text-left font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink"
            >
              drop plan on canvas
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function motionCanvasCardTone(
  kind: MotionCanvasMaterialPlan['cards'][number]['kind']
): 'neutral' | 'info' | 'ok' | 'warn' {
  if (kind === 'render-proof') return 'ok';
  if (kind === 'export-pack') return 'warn';
  if (kind === 'captured-material') return 'ok';
  if (kind === 'generation-node') return 'info';
  if (kind === 'story-beat') return 'info';
  return 'neutral';
}

function MotionRenderProofStrip({
  summary,
  onDropRenderProofToCanvas,
}: {
  summary: MotionPreviewRenderProofSummary;
  onDropRenderProofToCanvas?: (target: MotionPreviewRenderProofCanvasDropTarget) => void;
}) {
  const visibleArtifacts = summary.proofArtifacts.slice(0, 6);
  const canvasDropTarget = summary.canvasDropTargets[0] ?? null;
  const actionLabel =
    summary.actionLabels.slice(0, 2).join(' / ') ||
    summary.blockerLabels[0] ||
    'ready for review';
  const packageVerification = summary.packageVerification;
  const packageVerificationLabel =
    packageVerification.verificationLabels.slice(0, 2).join(' / ') || 'verification pending';
  const packageArtifactCheckLabel =
    packageVerification.artifactCheckLabels.slice(0, 3).join(' / ') ||
    'artifact checks pending';

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            render proof
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {summary.engineLabel
              ? `${summary.engineLabel} output review`
              : actionLabel}
          </div>
        </div>
        <Chip tone={renderProofTone(summary.status)} size="sm">
          {summary.status.replace(/-/g, ' ')}
        </Chip>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <Chip tone="neutral" size="sm">
              {summary.readyTargetCount}/{summary.totalTargetCount} targets
            </Chip>
            <Chip tone={summary.proofArtifactCount > 0 ? 'ok' : 'neutral'} size="sm">
              {summary.proofArtifactCount} artifacts
            </Chip>
            {summary.providerLabel ? (
              <Chip tone="neutral" size="sm">
                {summary.providerLabel}
              </Chip>
            ) : null}
          </div>
          {packageVerification.status === 'saved' ? (
            <div className="mb-2 rounded-sm border border-border-soft/80 bg-surface-canvas px-2 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <Chip tone="ok" size="sm">
                  source package
                </Chip>
                <Chip tone="neutral" size="sm">
                  {packageVerification.receiptCount} checks
                </Chip>
                {packageVerification.providerLabel ? (
                  <Chip tone="neutral" size="sm">
                    {packageVerification.providerLabel}
                  </Chip>
                ) : null}
              </div>
              <div className="truncate font-caption text-2xs text-ink-faint">
                verify: {packageVerificationLabel}
              </div>
              <div className="truncate font-caption text-2xs text-ink-faint">
                artifact checks: {packageArtifactCheckLabel}
              </div>
              {packageVerification.manifestPath ? (
                <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                  {packageVerification.manifestPath}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-1.5">
            {visibleArtifacts.map((artifact) => (
              <div
                key={`${artifact.targetLabel}-${artifact.kind}`}
                className="grid grid-cols-[minmax(0,1fr)_74px] items-center gap-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-caption text-xs text-ink">
                    {artifact.label}
                  </div>
                  <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
                    {artifact.path ?? artifact.targetLabel}
                  </div>
                </div>
                <Chip tone={artifact.status === 'ready' ? 'ok' : 'neutral'} size="sm">
                  {artifact.status}
                </Chip>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">{actionLabel}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(summary.artifactLabels.length > 0
              ? summary.artifactLabels
              : summary.missingArtifactLabels
            )
              .slice(0, 5)
              .map((label) => (
                <Chip key={label} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
          </div>
          {canvasDropTarget && onDropRenderProofToCanvas ? (
            <button
              type="button"
              onClick={() => onDropRenderProofToCanvas(canvasDropTarget)}
              className="mt-2 w-full rounded-sm border border-border-soft bg-surface-canvas px-3 py-2 text-left font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink"
            >
              drop video on canvas
            </button>
          ) : null}
          {summary.blockerLabels.length > 0 ? (
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {summary.blockerLabels[0]}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderProofTone(
  status: MotionPreviewRenderProofSummary['status']
): 'neutral' | 'info' | 'ok' | 'warn' {
  if (status === 'ready') return 'ok';
  if (status === 'partial') return 'info';
  if (status === 'needs-render') return 'warn';
  return 'neutral';
}

function MotionCapabilitySetupStrip({
  setup,
  onSelectCapabilitySetup,
}: {
  setup: MotionPreviewCapabilitySetup;
  onSelectCapabilitySetup?: (itemId: string) => void;
}) {
  const visibleItems = setup.items.slice(0, 6);
  const actionableItems = setup.items.filter((item) =>
    item.status === 'needs-provider' || item.status === 'needs-runner'
  );

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            capability setup
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {setup.nextActionLabel ?? 'ready for full auto'}
          </div>
        </div>
        <Chip tone={setup.status === 'ready' ? 'ok' : setup.status === 'blocked' ? 'warn' : 'info'} size="sm">
          {setup.readyCount} ready
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="grid gap-1.5">
            {visibleItems.map((item) => (
              <MotionCapabilitySetupRow key={item.id} item={item} />
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">
            {setup.status === 'ready' ? 'ready for full auto' : 'setup needed'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Chip tone="neutral" size="sm">
              {setup.missingCount} missing
            </Chip>
            <Chip tone="neutral" size="sm">
              {setup.blockedCount} blocked
            </Chip>
          </div>
          {setup.nextActionLabel ? (
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {setup.nextActionLabel}
            </div>
          ) : null}
        </div>
      </div>
      {actionableItems.length > 0 ? (
        <div className="mt-3 min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              setup cards
            </div>
            <Chip tone="info" size="sm">
              {actionableItems.length} actions
            </Chip>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {actionableItems.map((item) => (
              <MotionCapabilitySetupCard
                key={item.id}
                item={item}
                onSelectCapabilitySetup={onSelectCapabilitySetup}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MotionCapabilitySetupCard({
  item,
  onSelectCapabilitySetup,
}: {
  item: MotionPreviewCapabilitySetup['items'][number];
  onSelectCapabilitySetup?: (itemId: string) => void;
}) {
  const permissionLabel = setupPermissionLabel(item);
  const receiptLabel = setupReceiptLabel(item);
  const fullAutoContinuationLabel =
    item.fullAutoContinuationLabel ??
    (item.status === 'blocked'
      ? 'review gate before full auto continues'
      : item.status === 'configured'
        ? 'full auto can continue'
        : 'full auto resumes after receipts');
  const continuationLabel = fullAutoContinuationLabel
    ? `continue: ${fullAutoContinuationLabel}`
    : null;

  return (
    <article className="min-w-0 rounded-sm border border-border-soft bg-surface-canvas px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-caption text-xs text-ink">{item.label}</div>
          <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
            {item.actionLabel}
          </div>
        </div>
        <Chip tone={capabilitySetupTone(item.status)} size="sm">
          {item.status.replace(/-/g, ' ')}
        </Chip>
      </div>
      <div className="mt-2 grid gap-1 font-caption text-2xs text-ink-faint">
        {permissionLabel ? <div>{permissionLabel}</div> : null}
        {receiptLabel ? <div>{receiptLabel}</div> : null}
        {continuationLabel ? <div>{continuationLabel}</div> : null}
        {item.runnerLabels.length > 0 ? (
          <div className="truncate">{item.runnerLabels.slice(0, 2).join(' / ')}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onSelectCapabilitySetup?.(item.id)}
        className="mt-2 w-full rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 text-left font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!onSelectCapabilitySetup}
      >
        set up {item.label}
      </button>
    </article>
  );
}

function setupPermissionLabel(item: MotionPreviewCapabilitySetup['items'][number]): string | null {
  const label = item.permissionScopeLabel ?? item.requirementLabels[0] ?? item.blockerLabels[0] ?? null;
  return label ? `permission: ${label}` : null;
}

function setupReceiptLabel(item: MotionPreviewCapabilitySetup['items'][number]): string | null {
  const labels = item.expectedReceiptLabels ?? item.dryRunLabels ?? [];
  return labels.length > 0 ? `receipts: ${labels.slice(0, 4).join(' / ')}` : null;
}

function MotionCapabilitySetupRow({
  item,
}: {
  item: MotionPreviewCapabilitySetup['items'][number];
}) {
  const detailLabels =
    item.configuredProviderLabels.length > 0
      ? item.configuredProviderLabels
      : item.runnerLabels.length > 0
        ? item.runnerLabels
        : item.requirementLabels.length > 0
          ? item.requirementLabels
          : item.blockerLabels.length > 0
            ? item.blockerLabels
            : item.routeLabels;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-2">
      <div className="min-w-0">
        <div className="truncate font-caption text-xs text-ink">{item.label}</div>
        <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
          {item.actionLabel}
        </div>
        {detailLabels.length > 0 ? (
          <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
            {detailLabels.slice(0, 2).join(' / ')}
          </div>
        ) : null}
      </div>
      <Chip tone={capabilitySetupTone(item.status)} size="sm">
        {item.status.replace(/-/g, ' ')}
      </Chip>
    </div>
  );
}

function capabilitySetupTone(
  status: MotionPreviewCapabilitySetup['items'][number]['status']
): 'neutral' | 'info' | 'ok' | 'warn' {
  if (status === 'configured') return 'ok';
  if (status === 'blocked') return 'warn';
  if (status === 'needs-runner') return 'info';
  return 'neutral';
}

function MotionEditSourceStrip({
  editSource,
}: {
  editSource: MotionPreviewEditSource;
}) {
  const filePaths = [
    editSource.artifactPath,
    editSource.timelinePath,
    editSource.scriptPath,
    editSource.storyboardPath,
  ].filter((path): path is string => Boolean(path));
  const scopeLabel = editSource.regenerationScopes.join(' / ');
  const routeLabel = editSource.apiRoute ?? null;
  const actionLabel = editSource.actionLabel ?? null;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            edit source
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {editSource.status === 'ready'
              ? `${editSource.engine ?? 'render'} source bundle`
              : editSource.blockerLabels[0] ?? 'source bundle needed'}
          </div>
          {routeLabel || actionLabel ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {routeLabel ? (
                <Chip tone="neutral" size="sm">
                  {routeLabel}
                </Chip>
              ) : null}
              {actionLabel ? (
                <Chip tone="info" size="sm">
                  {actionLabel}
                </Chip>
              ) : null}
            </div>
          ) : null}
        </div>
        <Chip tone={editSource.status === 'ready' ? 'ok' : 'warn'} size="sm">
          {editSource.status === 'ready'
            ? `${editSource.editableComponentCount} targets`
            : 'source needed'}
        </Chip>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          {editSource.sourceFiles.length > 0 ? (
            <div className="grid gap-2">
              {editSource.sourceFiles.map((file) => (
                <div key={file.path} className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-caption text-xs text-ink">{file.label}</span>
                    <Chip tone="neutral" size="sm">
                      {file.path}
                    </Chip>
                  </div>
                  <div className="mt-0.5 font-caption text-2xs text-ink-faint">
                    {file.purpose}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {filePaths.map((path) => (
                <Chip key={path} tone="neutral" size="sm">
                  {path}
                </Chip>
              ))}
            </div>
          )}
          {scopeLabel ? (
            <div className="mt-2 truncate font-caption text-2xs text-ink-faint">
              {scopeLabel}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="grid gap-1.5">
            {editSource.components.slice(0, 4).map((component) => (
              <div
                key={`${component.trackId}-${component.clipId}-${component.componentId}`}
                className="min-w-0"
              >
                <div className="truncate font-caption text-xs text-ink">
                  {component.componentLabel}
                </div>
                <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
                  {component.editControlLabels.join(' / ') ||
                    component.regenerateScopes.join(' / ')}
                </div>
                {component.sourceFileLabels.length > 0 ? (
                  <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
                    {component.sourceFileLabels.join(' / ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {editSource.components.length === 0 ? (
            <div className="font-caption text-xs text-ink-faint">no editable targets</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MotionSourcePatchDraftStrip({
  draft,
  onApplySourcePatchDraft,
}: {
  draft: MotionSourcePatchDraft;
  onApplySourcePatchDraft?: (draftId: string) => void;
}) {
  const fileLabel = draft.files.map((file) => file.path).join(' / ') || 'source files pending';
  const clipLabel = draft.targetClipIds.join(' / ') || 'target clips pending';
  const canApply = draft.status === 'ready' && Boolean(onApplySourcePatchDraft);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            source patch draft
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {draft.status === 'ready'
              ? draft.sourceEditId
              : draft.blockers[0] ?? 'source patch blocked'}
          </div>
        </div>
        <Chip tone={draft.status === 'ready' ? 'ok' : 'warn'} size="sm">
          {draft.status}
        </Chip>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <Chip tone="neutral" size="sm">
              {draft.route}
            </Chip>
            <Chip tone="info" size="sm">
              {draft.sourceEditId}
            </Chip>
          </div>
          <div className="mt-2 truncate font-caption text-xs text-ink">
            {fileLabel}
          </div>
          <div className="mt-1 truncate font-caption text-2xs text-ink-faint">
            {clipLabel}
          </div>
        </div>

        <button
          type="button"
          disabled={!canApply}
          onClick={() => onApplySourcePatchDraft?.(draft.id)}
          className={cn(
            'rounded-sm border px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
            canApply
              ? 'border-accent/50 bg-accent/10 text-accent hover:border-accent hover:text-ink'
              : 'cursor-default border-border-soft bg-surface-panel text-ink-faint'
          )}
        >
          apply source patch draft
        </button>
      </div>
    </div>
  );
}

function MotionSourcePatchDraftOptionsStrip({
  drafts,
  onApplySourcePatchDraft,
  onAuthorSourcePatchDraft,
}: {
  drafts: MotionSourcePatchDraftOption[];
  onApplySourcePatchDraft?: (draftId: string) => void;
  onAuthorSourcePatchDraft?: (draftId: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            source patch variations
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {drafts.length} editable drafts
          </div>
        </div>
        <Chip tone="info" size="sm">
          review
        </Chip>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {drafts.map((draft) => {
          const fileLabel =
            draft.files.map((file) => file.path).join(' / ') || 'source files pending';
          const clipLabel = draft.targetClipIds.join(' / ') || 'target clips pending';
          const canApply = draft.status === 'ready' && Boolean(onApplySourcePatchDraft);
          const canAuthor =
            draft.authoringRequest?.status === 'ready' && Boolean(onAuthorSourcePatchDraft);

          return (
            <div
              key={draft.id}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-caption text-xs text-ink">
                    {draft.label}
                  </div>
                  <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
                    {draft.description}
                  </div>
                </div>
                <Chip tone={draft.status === 'ready' ? 'ok' : 'warn'} size="sm">
                  {draft.isDefault ? 'default' : draft.status}
                </Chip>
              </div>
              {draft.authoringRequest?.status === 'ready' ? (
                <div className="mt-2 flex">
                  <Chip tone="info" size="sm">
                    agent-ready
                  </Chip>
                </div>
              ) : null}
              <div className="mt-2 truncate font-caption text-2xs text-ink">
                {fileLabel}
              </div>
              <div className="mt-1 truncate font-caption text-2xs text-ink-faint">
                {clipLabel}
              </div>
              <button
                type="button"
                aria-label={`apply ${draft.label}`}
                disabled={!canApply}
                onClick={() => onApplySourcePatchDraft?.(draft.id)}
                className={cn(
                  'mt-2 h-8 w-full rounded-sm border px-2 text-left font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                  canApply
                    ? 'border-accent/50 bg-accent/10 text-accent hover:border-accent hover:text-ink'
                    : 'cursor-default border-border-soft bg-surface-muted text-ink-faint'
                )}
              >
                apply
              </button>
              <button
                type="button"
                aria-label={`author ${draft.label}`}
                disabled={!canAuthor}
                onClick={() => onAuthorSourcePatchDraft?.(draft.id)}
                className={cn(
                  'mt-2 h-8 w-full rounded-sm border px-2 text-left font-mono text-2xs uppercase tracking-wide transition-colors duration-fast ease-quick',
                  canAuthor
                    ? 'border-signal-info/40 bg-signal-info/10 text-signal-info hover:border-signal-info hover:text-ink'
                    : 'cursor-default border-border-soft bg-surface-muted text-ink-faint'
                )}
              >
                author with agent
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MotionProductionStepRow({
  step,
  isNext,
}: {
  step: MotionProductionStep;
  isNext: boolean;
}) {
  const receiptLabels = step.verificationReceipts.map((receipt) => receipt.label);
  const detailLabel = isNext
    ? step.actionLabel
    : (receiptLabels.length > 0 ? receiptLabels : step.artifactLabels).slice(0, 2).join(' / ');

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_74px] items-center gap-2">
      <div className="min-w-0">
        <div className="truncate font-caption text-xs text-ink">{step.label}</div>
        <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
          {detailLabel}
        </div>
      </div>
      <Chip tone={productionStepTone(step, isNext)} size="sm">
        {isNext ? 'next' : step.status}
      </Chip>
    </div>
  );
}

function productionStepTone(
  step: MotionProductionStep,
  isNext: boolean
): 'neutral' | 'info' | 'ok' | 'warn' {
  if (isNext) return 'info';
  if (step.status === 'complete') return 'ok';
  if (step.status === 'blocked') return 'warn';
  return 'neutral';
}

function MotionWorkflowSkillStrip({
  draft,
  handoff,
  onRunAgentTemplate,
}: {
  draft: MotionWorkflowSkillDraft;
  handoff: MotionAgentExecutionHandoff | null;
  onRunAgentTemplate?: (templateId: string) => void;
}) {
  const fullAutoTemplate = findAgentTemplateByHints(
    handoff,
    draft.capabilityPlan.fullAutoTemplateHints
  );

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            workflow skill
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {draft.manifest.description}
          </div>
        </div>
        <Chip tone="info" size="sm">
          {draft.draftVariationLabels.length > 0
            ? `${draft.draftVariationLabels.length} variations`
            : 'SKILL.md ready'}
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">{draft.trigger}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(draft.draftVariationLabels.length > 0
              ? draft.draftVariationLabels
              : draft.reviewPolicyLabels
            )
              .slice(0, 4)
              .map((label) => (
                <Chip key={label} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {draft.startShorthands.join(' / ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(draft.componentSlotLabels.length > 0
              ? draft.componentSlotLabels
              : draft.verificationLabels
            )
              .slice(0, 4)
              .map((label) => (
                <Chip key={label} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
          </div>
          {draft.referencePatternLabels.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {draft.referencePatternLabels.slice(0, 3).map((label) => (
                <Chip key={label} tone="info" size="sm">
                  {label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            launch kit
          </div>
          <div className="mt-1 font-caption text-xs text-ink">{draft.launchKit.label}</div>
          {draft.launchKit.postLines[0] ? (
            <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
              {draft.launchKit.postLines[0]}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">
            {draft.launchKit.installCommand ?? draft.launchKit.primaryFormat ?? 'format draft'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(draft.launchKit.platformTargets.length > 0
              ? draft.launchKit.platformTargets
              : draft.launchKit.reviewArtifactLabels
            )
              .slice(0, 4)
              .map((label) => (
                <Chip key={label} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
          </div>
        </div>
      </div>
      {draft.skillPackRequirements.length > 0 ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {draft.skillPackRequirements.slice(0, 2).map((pack) => (
            <div
              key={pack.id}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                skill pack
              </div>
              <div className="mt-1 truncate font-caption text-xs text-ink">
                {pack.label}
              </div>
              <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                {pack.installCommand}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {pack.verificationLabels.slice(0, 3).map((label) => (
                  <Chip key={label} tone="neutral" size="sm">
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {draft.launchKit.reviewObjects.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {selectLaunchKitReviewObjects(draft.launchKit.reviewObjects).map((object) => (
            <div
              key={object.id}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {formatLaunchKitReviewObjectKind(object.kind)}
              </div>
              <div className="mt-1 truncate font-caption text-xs text-ink">
                {object.label}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {object.artifactLabels.slice(0, 3).map((label) => (
                  <Chip key={label} tone="neutral" size="sm">
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {draft.capabilityPlan.steps.length > 0 ? (
        <div className="mt-2 min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              capability plan
            </div>
            <div className="flex flex-wrap gap-1">
              <Chip tone="info" size="sm">
                {formatCapabilityPlanMode(draft.capabilityPlan.mode)}
              </Chip>
              <Chip tone={draft.capabilityPlan.canRunFullAuto ? 'ok' : 'neutral'} size="sm">
                {draft.capabilityPlan.canRunFullAuto ? 'full auto ready' : 'review only'}
              </Chip>
              {fullAutoTemplate && onRunAgentTemplate ? (
                <button
                  type="button"
                  onClick={() => onRunAgentTemplate(fullAutoTemplate.id)}
                  aria-label={`run ${fullAutoTemplate.label} from capability plan`}
                  className="rounded-pill border border-accent/40 px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-accent transition-colors duration-fast ease-quick hover:border-accent hover:text-ink"
                >
                  run full auto
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
            {selectCapabilityPlanSteps(draft.capabilityPlan.steps).map((step) => {
              const stepTemplate = findAgentTemplateByHints(handoff, step.agentTemplateHints);

              return (
                <div
                  key={step.id}
                  className="min-w-0 rounded-sm border border-border-soft bg-surface-canvas px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-caption text-xs text-ink">{step.label}</div>
                      {step.reviewObjectLabels[0] ? (
                        <div className="mt-1 truncate font-caption text-2xs text-ink-faint">
                          {step.reviewObjectLabels[0]}
                        </div>
                      ) : null}
                    </div>
                    <Chip tone={step.reviewRequired ? 'warn' : 'ok'} size="sm">
                      {step.reviewRequired ? 'review' : 'auto'}
                    </Chip>
                  </div>
                  {step.editSurfaceLabels.length > 0 ? (
                    <div className="mt-2 truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                      {step.editSurfaceLabels.slice(0, 3).join(' / ')}
                    </div>
                  ) : null}
                  {step.agentTemplateHints.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {step.agentTemplateHints.slice(0, 3).map((templateHint) => (
                        <Chip key={templateHint} tone="neutral" size="sm">
                          {templateHint}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                  {stepTemplate && onRunAgentTemplate ? (
                    <button
                      type="button"
                      onClick={() => onRunAgentTemplate(stepTemplate.id)}
                      aria-label={`run ${stepTemplate.label} from ${step.label} capability step`}
                      className="mt-2 w-full rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 text-left font-caption text-xs text-ink-dim transition-colors duration-fast ease-quick hover:border-accent hover:text-accent"
                    >
                      {step.reviewRequired ? 'review action' : 'run action'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MotionInteractiveDemoStrip({
  summary,
}: {
  summary: MotionPreviewPlan['interactiveDemo'];
}) {
  const exportPlan = summary.exportPlan;
  const primaryCounts = [
    formatCount(summary.markerCount, 'marker'),
    formatCount(summary.chapterCount, 'chapter'),
    formatCount(summary.hotspotCount, 'hotspot'),
    formatCount(summary.calloutCount, 'callout'),
    formatCount(summary.branchCount, 'branch'),
    formatCount(summary.linkCount, 'link'),
  ].filter((label) => !label.startsWith('0 '));

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            interactive demo
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {summary.nextActionLabels[0] ?? 'Review interactive markers'}
          </div>
        </div>
        <Chip tone={summary.status === 'ready' ? 'ok' : 'neutral'} size="sm">
          {formatCount(summary.markerCount, 'marker')}
        </Chip>
      </div>
      <div className="flex flex-wrap gap-1">
        {primaryCounts.slice(1).map((label) => (
          <Chip key={label} tone="neutral" size="sm">
            {label}
          </Chip>
        ))}
      </div>
      <div className="mt-2 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-caption text-xs text-ink">interactive manifest</div>
            <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
              {exportPlan.manifest?.path ?? exportPlan.blockerLabels[0] ?? 'markers required'}
            </div>
          </div>
          <Chip tone={exportPlan.status === 'ready' ? 'ok' : 'warn'} size="sm">
            {exportPlan.status.replace(/-/g, ' ')}
          </Chip>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip tone="neutral" size="sm">
            {formatCount(exportPlan.exportableMarkerCount, 'export marker')}
          </Chip>
          {exportPlan.shareTarget ? (
            <Chip tone="neutral" size="sm">
              share metadata
            </Chip>
          ) : null}
          {exportPlan.markerKindLabels.slice(0, 4).map((label) => (
            <Chip key={label} tone="neutral" size="sm">
              {label}
            </Chip>
          ))}
        </div>
      </div>
      {summary.markers.length > 0 ? (
        <div className="mt-2 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {summary.markers.slice(0, 8).map((marker) => (
            <div
              key={marker.id}
              className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {marker.kind}
              </div>
              <div className="mt-1 truncate font-caption text-xs text-ink">{marker.label}</div>
              <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
                {formatPreviewTime(marker.timeSeconds)} / {formatPreviewDuration(marker.durationSeconds)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {marker.metadataLabels.slice(0, 3).map((label) => (
                  <Chip key={label} tone="neutral" size="sm">
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatCapabilityPlanMode(mode: string): string {
  return mode === 'full-auto' ? 'full auto mode' : `${mode} mode`;
}

function selectCapabilityPlanSteps<
  T extends { gateId: string; id: string }
>(steps: T[]): T[] {
  const priority = ['plan', 'drafts', 'capture', 'visuals', 'voice', 'timeline', 'render', 'export'];
  const selected = priority.flatMap((gateId) => {
    const step = steps.find((candidate) => candidate.gateId === gateId);
    return step ? [step] : [];
  });
  if (selected.length > 0) return selected.slice(0, 5);
  return steps.slice(0, 5);
}

function findAgentTemplateByHints(
  handoff: MotionAgentExecutionHandoff | null,
  hints: string[]
): MotionAgentExecutionHandoff['templates'][number] | null {
  if (!handoff) return null;
  return (
    hints
      .map((hint) => handoff.templates.find((template) => template.id === hint))
      .find((template): template is MotionAgentExecutionHandoff['templates'][number] =>
        Boolean(template)
      ) ?? null
  );
}

function formatLaunchKitReviewObjectKind(kind: string): string {
  return kind.replace(/-/g, ' ');
}

function selectLaunchKitReviewObjects<
  T extends { kind: string; id: string }
>(objects: T[]): T[] {
  const priority = [
    'source-evidence',
    'draft-variation',
    'component-regeneration',
    'teaser-target',
    'export-pack',
  ];
  const selected = priority.flatMap((kind) => {
    const object = objects.find((candidate) => candidate.kind === kind);
    return object ? [object] : [];
  });
  if (selected.length > 0) return selected;
  return objects.slice(0, 5);
}

function MotionSourceMaterialStrip({
  sourceProfile,
  captureRunner,
  onCaptureMotion,
}: {
  sourceProfile: MotionPreviewSourceProfile;
  captureRunner?: TimelineCaptureRunnerInput;
  onCaptureMotion?: (requestIds?: string[], options?: TimelineCaptureActionOptions) => void;
}) {
  const captureOptions = captureRunner ? { captureRunner } : undefined;
  const [allCapturesOpen, setAllCapturesOpen] = useState(false);
  const hiddenCaptureCount = Math.max(sourceProfile.captureCandidates.length - 3, 0);
  const visibleCandidates = allCapturesOpen
    ? sourceProfile.captureCandidates
    : sourceProfile.captureCandidates.slice(0, 3);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            source material
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {sourceProfile.summary}
          </div>
        </div>
        <Chip tone={sourceProfile.readyCaptureCount > 0 ? 'ok' : 'info'} size="sm">
          {sourceProfile.readyCaptureCount > 0
            ? `${sourceProfile.readyCaptureCount} captures`
            : sourceProfile.sourceKind.replace(/-/g, ' ')}
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">{sourceProfile.label}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {sourceProfile.signalLabels.slice(0, 6).map((label) => (
              <Chip key={label} tone="neutral" size="sm">
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          {hiddenCaptureCount > 0 ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                capture targets
              </span>
              <button
                type="button"
                onClick={() => setAllCapturesOpen((open) => !open)}
                className="rounded-sm border border-border-soft bg-surface-canvas px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                {allCapturesOpen
                  ? 'show fewer captures'
                  : `show all captures +${hiddenCaptureCount}`}
              </button>
            </div>
          ) : null}
          {visibleCandidates.length > 0 ? (
            <div className="grid gap-1.5">
              {visibleCandidates.map((candidate) => (
                <MotionSourceCaptureCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  captureOptions={captureOptions}
                  onCaptureMotion={onCaptureMotion}
                />
              ))}
            </div>
          ) : (
            <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {sourceProfile.captureCandidateLabels.slice(0, 2).join(' / ')}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {sourceProfile.storyboardHintLabels.slice(0, 3).map((label) => (
          <Chip key={label} tone="neutral" size="sm">
            {label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MotionSourceCaptureCandidateRow({
  candidate,
  captureOptions,
  onCaptureMotion,
}: {
  candidate: MotionPreviewSourceCaptureCandidate;
  captureOptions?: TimelineCaptureActionOptions;
  onCaptureMotion?: (requestIds?: string[], options?: TimelineCaptureActionOptions) => void;
}) {
  const action = candidate.action;
  const targetLabel = candidate.targetRef ? captureTargetLabel(candidate.targetRef) : 'source needed';

  return (
    <div className="rounded-sm border border-border-soft/80 bg-surface-canvas px-2 py-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-caption text-xs text-ink">{candidate.label}</span>
        <Chip tone={candidate.action ? 'neutral' : 'warn'} size="sm">
          {candidate.mode.replace(/-/g, ' ')}
        </Chip>
      </div>
      <div className="mt-1 truncate font-caption text-2xs text-ink-faint">
        {targetLabel}
      </div>
      {candidate.setupLabel ? (
        <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
          {candidate.setupLabel}
        </div>
      ) : null}
      <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
        {candidate.reason}
      </div>
      {action && onCaptureMotion ? (
        <button
          type="button"
          onClick={() =>
            captureOptions
              ? onCaptureMotion(action.requestTemplate.requestIds, captureOptions)
              : onCaptureMotion(action.requestTemplate.requestIds)
          }
          className="mt-2 rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
        >
          {action.label}
        </button>
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

function MotionReferenceGrammarStrip({
  grammar,
}: {
  grammar: MotionPreviewPlan['referenceGrammar'];
}) {
  const reviewCueLabel = grammar.cueLabels.find((label) => /draft board/i.test(label));

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            video grammar
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {grammar.sourceFamilyLabels.join(' / ')}
          </div>
        </div>
        <Chip tone={grammar.status === 'ready' ? 'ok' : 'warn'} size="sm">
          {grammar.cueLabels.length} cues
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-caption text-xs text-ink">
            {grammar.cueLabels.slice(0, 6).join(' / ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {grammar.componentLabels.slice(0, 6).map((label) => (
              <Chip key={label} tone="neutral" size="sm">
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            {grammar.editSurfaceLabels.slice(0, 4).join(' / ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {grammar.nextActionLabels.slice(0, 3).map((label) => (
              <Chip key={label} tone="info" size="sm">
                {label}
              </Chip>
            ))}
            {reviewCueLabel ? (
              <Chip tone="neutral" size="sm">
                {reviewCueLabel}
              </Chip>
            ) : null}
          </div>
          {grammar.verificationLabels.length > 0 ? (
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {grammar.verificationLabels[0]}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MotionReferenceSignalsStrip({
  signals,
  onRegenerateComponent,
}: {
  signals: MotionPreviewPlan['referenceSignals'];
  onRegenerateComponent?: (actionId: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            reference signals
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {signals
              .slice(0, 3)
              .map((signal) => signal.observedFormatLabel)
              .join(' / ')}
          </div>
        </div>
        <Chip tone="info" size="sm">
          {signals.length} examples
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {signals.slice(0, 4).map((signal) => (
          <div
            key={signal.id}
            className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-caption text-xs text-ink">{signal.title}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Chip tone="neutral" size="sm">
                    {signal.observedFormatLabel}
                  </Chip>
                  <Chip tone="neutral" size="sm">
                    {signal.proofBoundaryLabel}
                  </Chip>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {signal.sourceLabel}
              </span>
            </div>
            {signal.shotNotes[0] ? (
              <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
                {signal.shotNotes[0]}
              </div>
            ) : null}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {signal.componentLabels.slice(0, 4).join(' / ')}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {signal.styleLabels.slice(0, 4).map((label) => (
                <Chip key={`${signal.id}-${label}`} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
            </div>
            {onRegenerateComponent && signal.actions.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {signal.actions.slice(0, 2).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    aria-label={referenceSignalActionAriaLabel(signal.title, action)}
                    onClick={() => onRegenerateComponent(action.id)}
                    className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 text-left transition-colors hover:border-accent hover:text-accent"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-caption text-2xs text-ink-dim">
                        {action.label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                        {action.scope}
                      </span>
                    </span>
                    <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                      receipts:{' '}
                      {action.expectedReceiptLabels
                        .filter((label) => label !== 'reference signal')
                        .slice(0, 2)
                        .join(' / ')}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function referenceSignalActionAriaLabel(
  signalTitle: string,
  action: MotionPreviewPlan['referenceSignals'][number]['actions'][number]
): string {
  if (action.scope === 'effect') return `apply reference style from ${signalTitle}`;
  if (action.scope === 'capture') return `regenerate capture from ${signalTitle}`;
  return `apply reference ${action.scope} from ${signalTitle}`;
}

function MotionTasteReferencesStrip({
  references,
  onRegenerateComponent,
}: {
  references: MotionPreviewPlan['tasteReferences'];
  onRegenerateComponent?: (actionId: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            taste references
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            {references
              .slice(0, 3)
              .map((reference) => reference.hookTypeLabel)
              .join(' / ')}
          </div>
        </div>
        <Chip tone="info" size="sm">
          {references.length} cuts
        </Chip>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {references.slice(0, 4).map((reference) => (
          <div
            key={reference.id}
            className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-caption text-xs text-ink">{reference.title}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Chip tone="neutral" size="sm">
                    {reference.reviewStatusLabel}
                  </Chip>
                  <Chip tone="neutral" size="sm">
                    {reference.hookTypeLabel}
                  </Chip>
                  <Chip tone="neutral" size="sm">
                    {reference.targetCropLabels.join(' / ')}
                  </Chip>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {reference.sourceLabel}
              </span>
            </div>
            <div className="mt-2 line-clamp-2 font-caption text-2xs text-ink-faint">
              {reference.aetherUse}
            </div>
            {reference.shotList[0] ? (
              <div className="mt-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-caption text-2xs text-ink-dim">
                    {reference.shotList[0].label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                    {reference.shotList[0].timeRangeLabel}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-faint">
                  {reference.shotList[0].visual}
                </div>
                <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                  {reference.shotList[0].componentLabels.slice(0, 4).join(' / ')}
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1">
              {reference.effectLabels.slice(0, 4).map((label) => (
                <Chip key={`${reference.id}-${label}`} tone="neutral" size="sm">
                  {label}
                </Chip>
              ))}
            </div>
            {onRegenerateComponent && reference.actions.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {reference.actions.slice(0, 2).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    aria-label={tasteReferenceActionAriaLabel(reference.title, action)}
                    onClick={() => onRegenerateComponent(action.id)}
                    className="rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 text-left transition-colors hover:border-accent hover:text-accent"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-caption text-2xs text-ink-dim">
                        {action.label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                        {action.scope}
                      </span>
                    </span>
                    <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                      receipts:{' '}
                      {action.expectedReceiptLabels
                        .filter((label) => label !== 'taste reference')
                        .slice(0, 2)
                        .join(' / ')}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function tasteReferenceActionAriaLabel(
  referenceTitle: string,
  action: MotionPreviewPlan['tasteReferences'][number]['actions'][number]
): string {
  if (action.scope === 'capture') return `regenerate capture from ${referenceTitle}`;
  return `apply taste reference from ${referenceTitle}`;
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
  onEditClipProps,
  onEditClipSourceKeyframes,
  onEditClipEffect,
  onEditClipTiming,
}: {
  clip: MotionPreviewTimelineClip;
  onEditClipSummary?: (clipId: string, summary: string) => void;
  onEditClipProps?: (clipId: string, props: Record<string, EditableClipPropValue>) => void;
  onEditClipSourceKeyframes?: (clipId: string, keyframes: MotionSourceKeyframe[]) => void;
  onEditClipEffect?: (clipId: string, effectPreset: MotionEffectPresetId) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
}) {
  const [summary, setSummary] = useState(clip.summary);
  const [assetId, setAssetId] = useState(editableStringValue(clip, 'assetId'));
  const [caption, setCaption] = useState(editableStringValue(clip, 'caption', clip.summary));
  const [crop, setCrop] = useState(editableStringValue(clip, 'crop'));
  const [zoom, setZoom] = useState(editableNumberInputValue(clip, 'zoom', 1));
  const [cursorPath, setCursorPath] = useState(editableStringValue(clip, 'cursorPath'));
  const [sourceKeyframes, setSourceKeyframes] = useState(
    editableSourceKeyframesInputValue(clip)
  );
  const [startSeconds, setStartSeconds] = useState(formatSecondsInput(clip.startSeconds));
  const [durationSeconds, setDurationSeconds] = useState(
    formatSecondsInput(clip.durationSeconds)
  );

  useEffect(() => {
    setSummary(clip.summary);
    setAssetId(editableStringValue(clip, 'assetId'));
    setCaption(editableStringValue(clip, 'caption', clip.summary));
    setCrop(editableStringValue(clip, 'crop'));
    setZoom(editableNumberInputValue(clip, 'zoom', 1));
    setCursorPath(editableStringValue(clip, 'cursorPath'));
    setSourceKeyframes(editableSourceKeyframesInputValue(clip));
    setStartSeconds(formatSecondsInput(clip.startSeconds));
    setDurationSeconds(formatSecondsInput(clip.durationSeconds));
  }, [clip]);

  const canApply = summary.trim().length > 0 && summary.trim() !== clip.summary.trim();
  const hasAssetControl = clip.editControlIds.includes('assetId');
  const hasCaptionControl = clip.editControlIds.includes('caption');
  const hasCropControl = clip.editControlIds.includes('crop');
  const hasZoomControl = clip.editControlIds.includes('zoom');
  const hasCursorPathControl = clip.editControlIds.includes('cursorPath');
  const hasSourceKeyframesControl = clip.editControlIds.includes('sourceKeyframes');
  const hasSourceControls =
    hasAssetControl || hasCaptionControl || hasCropControl || hasZoomControl || hasCursorPathControl;
  const parsedZoom = Number(zoom);
  const zoomIsValid = !hasZoomControl || (Number.isFinite(parsedZoom) && parsedZoom > 0);
  const parsedSourceKeyframes = parseSourceKeyframesInput(sourceKeyframes);
  const sourceControlsChanged =
    (hasAssetControl && assetId.trim() !== editableStringValue(clip, 'assetId')) ||
    (hasCaptionControl && caption.trim() !== editableStringValue(clip, 'caption', clip.summary)) ||
    (hasCropControl && crop.trim() !== editableStringValue(clip, 'crop')) ||
    (hasCursorPathControl && cursorPath.trim() !== editableStringValue(clip, 'cursorPath')) ||
    (hasZoomControl &&
      Math.abs(parsedZoom - editableNumberValue(clip, 'zoom', 1)) > 0.001);
  const canApplySourceControls =
    Boolean(onEditClipProps) && hasSourceControls && zoomIsValid && sourceControlsChanged;
  const canApplySourceKeyframes =
    Boolean(onEditClipSourceKeyframes) &&
    hasSourceKeyframesControl &&
    parsedSourceKeyframes !== null &&
    sourceKeyframes.trim() !== editableSourceKeyframesInputValue(clip).trim();
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
        {hasSourceControls ? (
          <div className="grid gap-2 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
            {hasAssetControl ? (
              <label className="grid gap-1 font-caption text-2xs text-ink-dim">
                capture
                <input
                  type="text"
                  aria-label="clip capture asset"
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
                />
              </label>
            ) : null}
            {hasCaptionControl ? (
              <label className="grid gap-1 font-caption text-2xs text-ink-dim">
                caption
                <input
                  type="text"
                  aria-label="clip caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
                />
              </label>
            ) : null}
            {hasCropControl ? (
              <label className="grid gap-1 font-caption text-2xs text-ink-dim">
                crop
                <input
                  type="text"
                  aria-label="clip crop"
                  value={crop}
                  onChange={(event) => setCrop(event.target.value)}
                  className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
                />
              </label>
            ) : null}
            {hasZoomControl ? (
              <label className="grid gap-1 font-caption text-2xs text-ink-dim">
                zoom
                <input
                  type="number"
                  min="0.1"
                  step="0.05"
                  aria-label="clip zoom"
                  value={zoom}
                  onChange={(event) => setZoom(event.target.value)}
                  className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
                />
              </label>
            ) : null}
            {hasCursorPathControl ? (
              <label className="grid gap-1 font-caption text-2xs text-ink-dim">
                cursor
                <input
                  type="text"
                  aria-label="clip cursor path"
                  value={cursorPath}
                  onChange={(event) => setCursorPath(event.target.value)}
                  className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-caption text-xs text-ink outline-none focus:border-accent"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={!canApplySourceControls}
              onClick={() => {
                const props: Record<string, EditableClipPropValue> = {};
                if (hasAssetControl && assetId.trim() !== editableStringValue(clip, 'assetId')) {
                  props.assetId = assetId.trim();
                }
                if (
                  hasCaptionControl &&
                  caption.trim() !== editableStringValue(clip, 'caption', clip.summary)
                ) {
                  props.caption = caption.trim();
                }
                if (hasCropControl && crop.trim() !== editableStringValue(clip, 'crop')) {
                  props.crop = crop.trim();
                }
                if (
                  hasZoomControl &&
                  Math.abs(parsedZoom - editableNumberValue(clip, 'zoom', 1)) > 0.001
                ) {
                  props.zoom = parsedZoom;
                }
                if (
                  hasCursorPathControl &&
                  cursorPath.trim() !== editableStringValue(clip, 'cursorPath')
                ) {
                  props.cursorPath = cursorPath.trim();
                }
                onEditClipProps?.(clip.clipId, props);
              }}
              className="self-end rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              apply source controls
            </button>
          </div>
        ) : null}
        {hasSourceKeyframesControl ? (
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="grid gap-1 font-caption text-2xs text-ink-dim">
              source keyframes
              <textarea
                aria-label="clip source keyframes"
                value={sourceKeyframes}
                onChange={(event) => setSourceKeyframes(event.target.value)}
                rows={3}
                className="min-h-20 min-w-0 resize-y rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-mono text-2xs text-ink outline-none focus:border-accent"
              />
            </label>
            <button
              type="button"
              disabled={!canApplySourceKeyframes}
              onClick={() => {
                if (!parsedSourceKeyframes) return;
                onEditClipSourceKeyframes?.(clip.clipId, parsedSourceKeyframes);
              }}
              className="self-end rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              apply source keyframes
            </button>
          </div>
        ) : null}
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

function editableStringValue(
  clip: MotionPreviewTimelineClip,
  key: string,
  fallback = ''
): string {
  const value = clip.editableProps?.[key];
  return typeof value === 'string' ? value : fallback;
}

function editableNumberValue(
  clip: MotionPreviewTimelineClip,
  key: string,
  fallback: number
): number {
  const value = clip.editableProps?.[key];
  return typeof value === 'number' ? value : fallback;
}

function editableNumberInputValue(
  clip: MotionPreviewTimelineClip,
  key: string,
  fallback: number
): string {
  return formatSecondsInput(editableNumberValue(clip, key, fallback));
}

function editableSourceKeyframesInputValue(clip: MotionPreviewTimelineClip): string {
  const value = clip.editableProps?.sourceKeyframes;
  return typeof value === 'string' ? value : '[]';
}

function parseSourceKeyframesInput(value: string): MotionSourceKeyframe[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const keyframes = parsed.flatMap((candidate): MotionSourceKeyframe[] => {
    if (!isRecordValue(candidate)) return [];
    const atFrame = candidate.atFrame;
    if (typeof atFrame !== 'number' || !Number.isFinite(atFrame) || atFrame < 0) return [];

    const crop = optionalSourceKeyframeText(candidate.crop);
    const zoom =
      typeof candidate.zoom === 'number' && Number.isFinite(candidate.zoom) && candidate.zoom > 0
        ? candidate.zoom
        : undefined;
    const cursorPath = optionalSourceKeyframeText(candidate.cursorPath);
    const label = optionalSourceKeyframeText(candidate.label);
    if (candidate.zoom !== undefined && zoom === undefined) return [];

    return [
      {
        atFrame,
        ...(crop === undefined ? {} : { crop }),
        ...(zoom === undefined ? {} : { zoom }),
        ...(cursorPath === undefined ? {} : { cursorPath }),
        ...(label === undefined ? {} : { label }),
      },
    ];
  });

  return keyframes.length === parsed.length ? keyframes : null;
}

function optionalSourceKeyframeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

function EnginePreviewRow({
  engine,
  onRenderMotion,
}: {
  engine: MotionPreviewEnginePlan;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
}) {
  const renderPackage = engine.renderPackage;
  const verificationLabel = renderPackage
    ? renderPackage.verificationLabels.slice(0, 2).join(' / ') || 'verification pending'
    : null;
  const proofLabel = renderPackage
    ? renderPackage.proofArtifactLabels.slice(0, 3).join(' / ') || 'proof artifacts pending'
    : null;
  const sourcePackage = renderPackage?.sourcePackage ?? null;
  const dependencyLabel =
    sourcePackage?.dependencyLabels.slice(0, 4).join(' / ') || null;
  const scaffoldLabel = sourcePackage?.scaffoldCommandLabels[0] ?? null;
  const setupLabel = sourcePackage?.setupCommandLabels[0] ?? null;

  return (
    <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
      <div className="flex items-center justify-between gap-2">
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
      {renderPackage ? (
        <div className="mt-2 space-y-1 border-t border-border-soft/80 pt-2 font-caption text-2xs text-ink-faint">
          <div className="flex flex-wrap items-center gap-1">
            <Chip tone="neutral" size="sm">
              render package
            </Chip>
            <span className="truncate">
              {renderPackage.previewCommand?.label ?? 'preview pending'}
            </span>
          </div>
          <div className="truncate">verify: {verificationLabel}</div>
          <div className="truncate">proof: {proofLabel}</div>
          {sourcePackage ? (
            <div className="rounded-sm border border-border-soft bg-surface-canvas/70 px-2 py-2">
              <div className="flex flex-wrap items-center gap-1">
                <Chip tone="neutral" size="sm">
                  source setup
                </Chip>
                <span className="truncate">{sourcePackage.runtimeRequirement}</span>
              </div>
              {dependencyLabel ? <div className="mt-1 truncate">{dependencyLabel}</div> : null}
              {scaffoldLabel ? <div className="mt-1 truncate">{scaffoldLabel}</div> : null}
              {setupLabel ? <div className="mt-1 truncate">{setupLabel}</div> : null}
            </div>
          ) : null}
          <div className="truncate font-mono text-[10px] uppercase tracking-wide text-ink-dim">
            {renderPackage.manifestPath}
          </div>
          {onRenderMotion ? (
            <button
              type="button"
              onClick={() => onRenderMotion(renderPackage.action.engine)}
              className="mt-1 rounded-sm border border-border-soft bg-surface-canvas px-2 py-1 font-caption text-2xs text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink"
            >
              {renderPackage.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SyncSummaryRow({ summary }: { summary: MotionPreviewSyncSummary }) {
  const details = [
    formatCount(summary.beatCount, 'beat'),
    formatCount(summary.captionCount, 'caption'),
    formatCount(summary.transitionCount, 'transition'),
    formatCount(summary.effectCueCount, 'effect'),
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

function VisualSourcingSummaryRow({
  summary,
}: {
  summary: MotionPreviewVisualSourcingSummary;
}) {
  const detail =
    summary.requestCount > 0
      ? formatCount(summary.requestCount, 'source request')
      : summary.providerRequirementLabels.length > 0
        ? `Needs ${summary.providerRequirementLabels.join(' + ')}`
        : 'no source requests';
  const note = summary.blockerLabels[0] ?? summary.requestLabels[0] ?? 'ready for source review';

  return (
    <ReadinessRow
      label="visual sources"
      status={summary.status}
      detail={detail}
      note={note}
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
  onPlanVisuals,
  onGenerateVideoClips,
}: {
  summary: MotionPreviewVisualGenerationSummary;
  onPlanVisuals?: (requestIds?: string[]) => void;
  onGenerateVideoClips: () => void;
}) {
  const ready = summary.status === 'ready';
  const shouldPlanVisuals = summary.status === 'needs-visual-source' && Boolean(onPlanVisuals);
  const label = ready
    ? 'generate clips'
    : summary.status === 'needs-visual-source'
      ? 'plan visuals'
      : 'prepare clips';

  return (
    <button
      type="button"
      onClick={() => {
        if (shouldPlanVisuals) {
          onPlanVisuals?.();
          return;
        }
        onGenerateVideoClips();
      }}
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
  effectCues,
}: {
  status: MotionPreviewSyncSummary['status'];
  beats: MotionPreviewSyncBeat[];
  soundCues: MotionPreviewSyncSoundCue[];
  effectCues: MotionPreviewSyncEffectCue[];
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
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_240px]">
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
          {soundCues.length > 0 ? (
            <div className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
              audio cues
            </div>
          ) : null}
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
        <div className="grid gap-1.5">
          {effectCues.length > 0 ? (
            <div className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
              sync effects
            </div>
          ) : null}
          {effectCues.slice(0, 3).map((cue, index) => (
            <div
              key={`${cue.kind}-${cue.startSeconds}-${index}`}
              className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="font-caption text-xs text-ink">{cue.label}</div>
              <div className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-faint">
                {cue.effectPresetLabel} · {cue.startSeconds}s
              </div>
              <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                {cue.targetLabel}
                {cue.soundCueLabel ? ` · ${cue.soundCueLabel}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MotionVisualSourcingStrip({
  summary,
}: {
  summary: MotionPreviewVisualSourcingSummary;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
          visual sources
        </span>
        <Chip tone={summary.status === 'ready' || summary.status === 'complete' ? 'ok' : 'info'} size="sm">
          {summary.status.replace(/-/g, ' ')}
        </Chip>
      </div>
      {summary.requests.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-3">
          {summary.requests.map((request) => (
            <article
              key={request.requestId}
              className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-caption text-xs text-ink">{request.label}</span>
                <span className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
                  {request.kind.replace(/-/g, ' ')}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                {request.reason}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {request.targetRoles.slice(0, 4).map((role) => (
                  <Chip key={`${request.requestId}-${role}`} tone="neutral" size="sm">
                    {role}
                  </Chip>
                ))}
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {request.apiRoutes.slice(0, 2).join(' / ')}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 font-caption text-xs text-ink-dim">
          {summary.blockerLabels[0] ?? 'No visual source requests for this draft.'}
        </div>
      )}
    </div>
  );
}

function MotionVisualGenerationStrip({
  summary,
  onGenerateVideoClips,
  onApplyGeneratedVideoTake,
  onOpenNodeLens,
}: {
  summary: MotionPreviewVisualGenerationSummary;
  onGenerateVideoClips?: (requestIds?: string[]) => void;
  onApplyGeneratedVideoTake?: (clipId: string, takeId: string) => void;
  onOpenNodeLens?: () => void;
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
              <div className="mt-2 truncate font-caption text-2xs text-ink-faint">
                {request.sourceLabel}
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                {request.outputLabel}
              </div>
              {request.pendingTakes && request.pendingTakes.length > 0 ? (
                <div className="mt-2 grid gap-1" aria-label={`${request.componentLabel} takes`}>
                  {request.pendingTakes.map((take) => (
                    <button
                      key={take.takeId}
                      type="button"
                      onClick={() => onApplyGeneratedVideoTake?.(request.clipId, take.takeId)}
                      disabled={!onApplyGeneratedVideoTake}
                      aria-label={`apply ${take.providerLabel} take`}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-border-soft bg-surface-canvas px-2 py-1.5 text-left transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="truncate font-caption text-2xs text-ink">
                        {take.providerLabel}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                        {take.mimeType.replace('video/', '')}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 font-caption text-xs text-ink-dim">
          {summary.blockerLabels[0] ?? 'No image-to-video clips planned for this draft.'}
        </div>
      )}
      {summary.nodePlan.nodes.length > 0 ? (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
              generation nodes
            </span>
            {summary.nodePlan.edges.length > 0 ? (
              <span className="truncate font-caption text-2xs text-ink-faint">
                {summary.nodePlan.edges.map((edge) => edge.label).join(' / ')}
              </span>
            ) : null}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {summary.nodePlan.nodes.map((node) => (
              <div
                key={node.id}
                className={cn(
                  'min-w-0 rounded-sm border bg-surface-panel px-3 py-2',
                  node.id === summary.nodePlan.nextNodeId
                    ? 'border-accent/60'
                    : 'border-border-soft'
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-caption text-xs text-ink">
                    {node.label}
                  </span>
                  <Chip tone={visualGenerationNodeTone(node.status)} size="sm">
                    {node.status}
                  </Chip>
                </div>
                <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                  {node.inputLabels.slice(0, 2).join(' + ') || 'No inputs yet'}
                </div>
                <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                  {node.outputLabels.slice(0, 2).join(' / ') || 'No output yet'}
                </div>
                {node.actionLabel ? (
                  <div className="mt-2 truncate font-caption text-2xs text-accent">
                    {node.actionLabel}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {summary.nextActionLabels.map((label) => (
          <Chip key={label} tone="neutral" size="sm">
            {label}
          </Chip>
        ))}
        {summary.nodePlan.nodes.length > 0 && onOpenNodeLens ? (
          <button
            type="button"
            onClick={onOpenNodeLens}
            className="rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            open node lens
          </button>
        ) : null}
        {onGenerateVideoClips ? (
          <button
            type="button"
            onClick={() => onGenerateVideoClips()}
            className="rounded-sm border border-border-soft bg-surface-panel px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            {summary.status === 'ready' ? 'generate clips' : 'plan visuals'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function visualGenerationNodeTone(
  status: MotionPreviewVisualGenerationSummary['nodePlan']['nodes'][number]['status']
) {
  if (status === 'complete') return 'ok';
  if (status === 'ready') return 'info';
  if (status === 'blocked') return 'warn';
  return 'neutral';
}

type MotionGenerationNodeLensStatus =
  | MotionPreviewVisualGenerationSummary['nodePlan']['nodes'][number]['status']
  | MotionPreviewVisualGenerationSummary['nodePlan']['status']
  | MotionPreviewVisualSourcingSummary['status']
  | MotionPreviewSyncSummary['status']
  | MotionPreviewRenderProofSummary['status']
  | MotionPreviewExportPackSummary['status'];

interface MotionGenerationNodeLensCard {
  id: string;
  label: string;
  status: MotionGenerationNodeLensStatus;
  inputLabels: string[];
  outputLabels: string[];
  providerLabels: string[];
  receiptLabels: string[];
  actionLabel: string | null;
  onAction?: () => void;
}

function MotionGenerationNodeLens({
  previewPlan,
  onPlanVisuals,
  onGenerateVideoClips,
  onGenerateVoice,
  onSyncMotion,
  onRenderMotion,
  onExportPack,
}: {
  previewPlan: MotionPreviewPlan;
  onPlanVisuals?: (requestIds?: string[]) => void;
  onGenerateVideoClips?: (requestIds?: string[]) => void;
  onGenerateVoice?: () => void;
  onSyncMotion?: () => void;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
  onExportPack?: () => void;
}) {
  const renderEngine = preferredRenderEngine(previewPlan.enginePreviews);
  const nodes = buildGenerationNodeLensCards(previewPlan, {
    renderEngine: renderEngine?.engine ?? null,
    onPlanVisuals,
    onGenerateVideoClips,
    onGenerateVoice,
    onSyncMotion,
    onRenderMotion,
    onExportPack,
  });
  const edges = buildGenerationNodeLensEdges(previewPlan);
  const edgeNodeLabels = buildGenerationNodeLensLabelMap(previewPlan, nodes);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            advanced node lens
          </div>
          <div className="mt-1 truncate font-caption text-xs text-ink-faint">
            generation dependencies for visuals, voice, sync, render, and export
          </div>
        </div>
        <Chip tone="info" size="sm">
          {nodes.length} nodes
        </Chip>
      </div>
      {edges.length > 0 ? (
        <div
          aria-label="generation path"
          className="mb-3 rounded-sm border border-border-soft bg-surface-canvas px-3 py-2"
        >
          <div className="font-mono text-2xs uppercase tracking-wide text-ink-dim">
            generation path
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {edges.map((edge) => (
              <div
                key={`${edge.from}-${edge.to}-${edge.label}`}
                className="min-w-[180px] rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
              >
                <div className="truncate font-caption text-xs text-ink">
                  {edgeNodeLabels.get(edge.from) ?? readableLabel(edge.from)}
                </div>
                <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                  {edge.label}
                </div>
                <div className="mt-1 truncate font-caption text-2xs text-ink-dim">
                  {edgeNodeLabels.get(edge.to) ?? readableLabel(edge.to)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => (
          <article
            key={node.id}
            className="min-w-0 rounded-sm border border-border-soft bg-surface-panel px-3 py-2"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-caption text-xs text-ink">{node.label}</div>
                <div className="mt-0.5 truncate font-caption text-2xs text-ink-faint">
                  provider: {summarizeNodeLensLabels(node.providerLabels, 'review')}
                </div>
              </div>
              <Chip tone={generationNodeLensTone(node.status)} size="sm">
                {String(node.status).replace(/-/g, ' ')}
              </Chip>
            </div>
            <div className="mt-2 grid gap-1 font-caption text-2xs text-ink-dim">
              <div>inputs: {summarizeNodeLensLabels(node.inputLabels, 'source material')}</div>
              <div>outputs: {summarizeNodeLensLabels(node.outputLabels, 'review artifacts')}</div>
              <div>receipts: {summarizeNodeLensLabels(node.receiptLabels, 'pending proof')}</div>
            </div>
            {node.actionLabel && node.onAction ? (
              <button
                type="button"
                onClick={node.onAction}
                className="mt-2 w-full rounded-sm border border-border-soft bg-surface-canvas px-2 py-1.5 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                {node.actionLabel}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function buildGenerationNodeLensCards(
  previewPlan: MotionPreviewPlan,
  options: {
    renderEngine: MotionRenderEngine | null;
    onPlanVisuals?: (requestIds?: string[]) => void;
    onGenerateVideoClips?: (requestIds?: string[]) => void;
    onGenerateVoice?: () => void;
    onSyncMotion?: () => void;
    onRenderMotion?: (engine: MotionRenderEngine) => void;
    onExportPack?: () => void;
  }
): MotionGenerationNodeLensCard[] {
  const visualNode = previewPlan.visualGenerationSummary.nodePlan.nodes.find(
    (node) => node.id === 'image-to-video'
  );
  const visualSourceRequestNodes = previewPlan.visualSourcingSummary.requests.map((request) => ({
    id: visualSourceRequestNodeId(request),
    label: `Visual source · ${request.label}`,
    status: previewPlan.visualSourcingSummary.status,
    inputLabels: uniqueLabels([
      ...request.sourceLabels,
      ...request.targetRoles.map(readableLabel),
    ]),
    outputLabels: uniqueLabels([
      ...request.expectedOutputs,
      ...request.componentLabels,
    ]),
    providerLabels: request.providerRequirementLabels,
    receiptLabels: request.expectedOutputs,
    actionLabel: options.onPlanVisuals ? `regenerate ${request.label}` : null,
    onAction: options.onPlanVisuals
      ? () => options.onPlanVisuals?.([request.requestId])
      : undefined,
  }));
  const imageToVideoRequestNodes = previewPlan.visualGenerationSummary.requests.map((request) => ({
    id: imageToVideoRequestNodeId(request),
    label: `Image-to-video · ${request.componentLabel}`,
    status: imageToVideoRequestNodeStatus(request),
    inputLabels: uniqueLabels([
      request.sourceLabel,
      request.sourceKind ?? '',
      request.sourceMimeType ?? '',
    ]),
    outputLabels:
      request.pendingTakeLabels && request.pendingTakeLabels.length > 0
        ? request.pendingTakeLabels
        : request.selectedTakeLabels && request.selectedTakeLabels.length > 0
          ? request.selectedTakeLabels
          : [request.outputLabel],
    providerLabels: previewPlan.visualGenerationSummary.providerRequirementLabels,
    receiptLabels: productionReceiptLabels(previewPlan, 'visual-generation'),
    actionLabel: options.onGenerateVideoClips
      ? `generate ${request.componentLabel} video clip`
      : null,
    onAction: options.onGenerateVideoClips
      ? () => options.onGenerateVideoClips?.([request.requestId])
      : undefined,
  }));
  const renderReceipts =
    previewPlan.renderProofSummary.artifactLabels.length > 0
      ? previewPlan.renderProofSummary.artifactLabels
      : previewPlan.renderProofSummary.missingArtifactLabels;

  return [
    {
      id: 'visual-source',
      label: 'Visual sources',
      status: previewPlan.visualSourcingSummary.status,
      inputLabels: uniqueLabels(
        previewPlan.visualSourcingSummary.requests.flatMap((request) => request.sourceLabels)
      ),
      outputLabels: previewPlan.visualSourcingSummary.requestLabels,
      providerLabels: previewPlan.visualSourcingSummary.providerRequirementLabels,
      receiptLabels: productionReceiptLabels(previewPlan, 'visual-source'),
      actionLabel: options.onPlanVisuals ? 'regenerate Visual sources' : null,
      onAction: options.onPlanVisuals,
    },
    ...visualSourceRequestNodes,
    {
      id: 'image-to-video',
      label: 'Image-to-video',
      status: visualNode?.status ?? previewPlan.visualGenerationSummary.nodePlan.status,
      inputLabels: visualNode?.inputLabels ?? previewPlan.visualGenerationSummary.requestLabels,
      outputLabels: visualNode?.outputLabels ?? previewPlan.visualGenerationSummary.requestLabels,
      providerLabels: previewPlan.visualGenerationSummary.providerRequirementLabels,
      receiptLabels: productionReceiptLabels(previewPlan, 'visual-generation'),
      actionLabel: options.onGenerateVideoClips ? 'regenerate Image-to-video' : null,
      onAction: options.onGenerateVideoClips,
    },
    ...imageToVideoRequestNodes,
    {
      id: 'voice',
      label: 'Voice and captions',
      status: previewPlan.syncSummary.status,
      inputLabels: previewPlan.storyboard.map((beat) => readableLabel(beat.role)),
      outputLabels: ['voice clips', 'word timings', 'captions'],
      providerLabels: previewPlan.syncSummary.requirementLabels,
      receiptLabels: productionReceiptLabels(previewPlan, 'voice'),
      actionLabel: options.onGenerateVoice ? 'regenerate Voice and captions' : null,
      onAction: options.onGenerateVoice,
    },
    {
      id: 'sync',
      label: 'Timeline sync',
      status: previewPlan.syncSummary.status,
      inputLabels: ['voice clips', 'caption clips', 'effect markers'],
      outputLabels: ['beat markers', 'caption timing', 'transition cues'],
      providerLabels: previewPlan.syncSummary.requirementLabels,
      receiptLabels: productionReceiptLabels(previewPlan, 'sync'),
      actionLabel: options.onSyncMotion ? 'regenerate Timeline sync' : null,
      onAction: options.onSyncMotion,
    },
    {
      id: 'render',
      label: 'Render proof',
      status: previewPlan.renderProofSummary.status,
      inputLabels: ['editable timeline', previewPlan.editSource.timelinePath ?? 'timeline JSON'],
      outputLabels: previewPlan.renderProofSummary.targetLabels,
      providerLabels:
        previewPlan.renderProofSummary.providerLabel || options.renderEngine
          ? [
              previewPlan.renderProofSummary.providerLabel ??
                `${options.renderEngine ?? 'motion'} render runner`,
            ]
          : previewPlan.capabilitySetup.items.find((item) => item.id === 'render')
              ?.requirementLabels ?? [],
      receiptLabels: renderReceipts,
      actionLabel:
        options.onRenderMotion && options.renderEngine ? 'regenerate Render proof' : null,
      onAction:
        options.onRenderMotion && options.renderEngine
          ? () => options.onRenderMotion?.(options.renderEngine as MotionRenderEngine)
          : undefined,
    },
    {
      id: 'export',
      label: 'Export pack',
      status: previewPlan.exportPackSummary.status,
      inputLabels: previewPlan.renderProofSummary.targetLabels,
      outputLabels: previewPlan.exportPackSummary.targetLabels,
      providerLabels: ['export manifest'],
      receiptLabels:
        previewPlan.exportPackSummary.missingAssetKinds.length > 0
          ? previewPlan.exportPackSummary.missingAssetKinds.map(readableLabel)
          : ['manifest'],
      actionLabel: options.onExportPack ? 'regenerate Export pack' : null,
      onAction: options.onExportPack,
    },
  ];
}

function visualSourceRequestNodeId(
  request: MotionPreviewVisualSourcingSummary['requests'][number]
): string {
  return `visual-source-request-${request.requestId}`;
}

function imageToVideoRequestNodeId(
  request: MotionPreviewVisualGenerationSummary['requests'][number]
): string {
  return `image-to-video-request-${request.clipId}`;
}

function imageToVideoRequestNodeStatus(
  request: MotionPreviewVisualGenerationSummary['requests'][number]
): MotionGenerationNodeLensStatus {
  if ((request.pendingTakeCount ?? 0) > 0 || (request.selectedTakeCount ?? 0) > 0) {
    return 'complete';
  }
  return 'ready';
}

function buildGenerationNodeLensEdges(
  previewPlan: MotionPreviewPlan
): MotionPreviewVisualGenerationEdge[] {
  const visualEdges = previewPlan.visualGenerationSummary.nodePlan.edges;
  const visualNodeIds = new Set(
    previewPlan.visualGenerationSummary.nodePlan.nodes.map((node) => node.id)
  );
  const visualExitNodeId = visualNodeIds.has('timeline-update')
    ? 'timeline-update'
    : visualNodeIds.has('review-generated-clips')
      ? 'review-generated-clips'
      : 'image-to-video';
  return uniqueGenerationNodeLensEdges([
    ...visualEdges,
    ...previewPlan.visualSourcingSummary.requests.flatMap((request) => [
      {
        from: 'visual-source',
        to: visualSourceRequestNodeId(request),
        label: 'scopes source',
      },
      {
        from: visualSourceRequestNodeId(request),
        to: 'image-to-video',
        label: 'feeds motion',
      },
    ]),
    ...previewPlan.visualGenerationSummary.requests.flatMap((request) => [
      {
        from: 'image-to-video',
        to: imageToVideoRequestNodeId(request),
        label: 'scopes clip',
      },
      {
        from: imageToVideoRequestNodeId(request),
        to: 'review-generated-clips',
        label: 'offers take',
      },
    ]),
    { from: visualExitNodeId, to: 'sync', label: 'sets timing' },
    { from: 'voice', to: 'sync', label: 'adds narration' },
    { from: 'sync', to: 'render', label: 'renders proof' },
    { from: 'render', to: 'export', label: 'packages' },
  ]);
}

function uniqueGenerationNodeLensEdges(
  edges: MotionPreviewVisualGenerationEdge[]
): MotionPreviewVisualGenerationEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}:${edge.to}:${edge.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildGenerationNodeLensLabelMap(
  previewPlan: MotionPreviewPlan,
  nodes: MotionGenerationNodeLensCard[]
): Map<string, string> {
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  for (const node of previewPlan.visualGenerationSummary.nodePlan.nodes) {
    labels.set(node.id, node.label);
  }
  return labels;
}

function productionReceiptLabels(previewPlan: MotionPreviewPlan, gateId: string): string[] {
  const step = previewPlan.productionPlan.steps.find((candidate) => candidate.id === gateId);
  return step?.verificationReceipts.map((receipt) => receipt.label) ?? [];
}

function summarizeNodeLensLabels(labels: string[], fallback: string): string {
  const visibleLabels = uniqueLabels(labels).slice(0, 3);
  return visibleLabels.length > 0 ? visibleLabels.join(' / ') : fallback;
}

function generationNodeLensTone(status: MotionGenerationNodeLensStatus) {
  if (status === 'complete' || status === 'ready') return 'ok';
  if (status === 'blocked' || status === 'needs-visual-source' || status === 'needs-voice') {
    return 'warn';
  }
  if (status === 'partial' || status === 'needs-render') return 'info';
  return 'neutral';
}

function MotionCapturePlanView({
  capturePlan,
  captureRunner,
  onCaptureMotion,
}: {
  capturePlan: AgentMotionCapturePlan;
  captureRunner?: TimelineCaptureRunnerInput;
  onCaptureMotion?: (requestIds?: string[], options?: TimelineCaptureActionOptions) => void;
}) {
  const captureOptions = captureRunner ? { captureRunner } : undefined;
  const requiredRequestIds = capturePlan.requests
    .filter((request) => request.required)
    .map((request) => request.id);
  const recordingRequest = capturePlan.requests.find(
    (request) => request.request.mode === 'screen-recording'
  );
  const computerUseFallback = capturePlan.fallbacks.find(
    (fallback) => fallback.toolId === 'computer-use'
  );
  const targetLabel =
    capturePlan.target?.kind === 'url'
      ? captureTargetLabel(capturePlan.target.ref)
      : capturePlan.target?.kind === 'local-app'
        ? captureTargetLabel(capturePlan.target.ref)
      : 'source needed';
  const setupCommands = capturePlan.agentRunbook?.setupCommands ?? [];
  const runbookInstructions = capturePlan.agentRunbook?.instructions ?? [];
  const receiptLabels = capturePlan.agentRunbook?.reviewArtifactLabels ?? [];

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
          {setupCommands.length > 0 || receiptLabels.length > 0 ? (
            <div className="mb-2 grid gap-2 lg:grid-cols-2">
              {setupCommands.length > 0 ? (
                <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
                  <div className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
                    capture setup
                  </div>
                  <div className="mt-1 font-caption text-xs text-ink">
                    {setupCommands[0].command}
                  </div>
                  <div className="mt-1 line-clamp-1 font-caption text-2xs text-ink-dim">
                    {setupCommands[0].targetUrl}
                  </div>
                </div>
              ) : null}
              {receiptLabels.length > 0 ? (
                <div className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
                  <div className="font-mono text-2xs uppercase tracking-wide text-ink-faint">
                    capture receipts
                  </div>
                  <div className="mt-1 line-clamp-2 font-caption text-xs text-ink">
                    {receiptLabels.join(' / ')}
                  </div>
                  {runbookInstructions[0] ? (
                    <div className="mt-1 line-clamp-1 font-caption text-2xs text-ink-dim">
                      {runbookInstructions[0]}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
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
          {computerUseFallback ? (
            <div className="mt-2 rounded-sm border border-border-soft bg-surface-panel px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-caption text-xs text-ink">computer control fallback</div>
                <Chip tone="warn" size="sm">
                  approval required
                </Chip>
              </div>
              <div className="mt-1 line-clamp-2 font-caption text-2xs text-ink-dim">
                {computerUseFallback.permissionGate.label}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Chip tone="neutral" size="sm">
                  {computerUseFallback.outputContract.artifactKinds.join(' / ')}
                </Chip>
                <Chip tone="neutral" size="sm">
                  {computerUseFallback.safeScope.redactionLabels.slice(0, 3).join(' / ')}
                </Chip>
              </div>
            </div>
          ) : null}
        </div>
        {onCaptureMotion ? (
          <div className="flex flex-wrap content-start gap-1.5">
            {requiredRequestIds.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  captureOptions
                    ? onCaptureMotion(requiredRequestIds, captureOptions)
                    : onCaptureMotion(requiredRequestIds)
                }
                className="rounded-sm border border-border-soft bg-surface-panel px-3 py-2 text-left font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                capture stills
              </button>
            ) : null}
            {recordingRequest ? (
              <button
                type="button"
                onClick={() =>
                  captureOptions
                    ? onCaptureMotion([recordingRequest.id], captureOptions)
                    : onCaptureMotion([recordingRequest.id])
                }
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
  executionEntry,
  onRegenerateComponent,
}: {
  action: MotionPreviewRegenerationAction;
  executionEntry?: MotionPreviewExecutionHistoryEntry | null;
  onRegenerateComponent?: (actionId: string) => void;
}) {
  const capabilityLabel = readableActionToolLabel(action.toolId);
  const receiptLabel = action.expectedReceiptLabels
    .filter((label) => label !== 'regeneration request')
    .slice(0, 2)
    .join(' / ');
  const savedReceiptLabel = executionEntry?.receiptLabels.slice(0, 2).join(' / ') ?? '';

  return (
    <button
      type="button"
      onClick={() => onRegenerateComponent?.(action.id)}
      className={cn(
        'min-w-[210px] rounded-sm border px-3 py-2 text-left transition-colors duration-fast ease-quick hover:text-ink',
        executionEntry
          ? 'border-accent/60 bg-accent/10'
          : 'border-border-soft bg-surface-panel hover:border-border'
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-caption text-xs text-ink-dim">{action.label}</span>
        {executionEntry ? (
          <span className="shrink-0 rounded-sm border border-accent/30 bg-surface-panel/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent">
            staged
          </span>
        ) : null}
      </span>
      <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        {capabilityLabel}
      </span>
      {receiptLabel ? (
        <span className="mt-1 block font-caption text-2xs text-ink-faint">
          receipts: {receiptLabel}
        </span>
      ) : null}
      {savedReceiptLabel ? (
        <span className="mt-1 block font-caption text-2xs text-ink-dim">
          saved: {savedReceiptLabel}
        </span>
      ) : null}
    </button>
  );
}

function readableActionToolLabel(toolId: MotionPreviewRegenerationAction['toolId']): string {
  return toolId.replace(/-/g, ' ');
}

function findRegenerationExecutionEntry(
  action: MotionPreviewRegenerationAction,
  executionHistory: MotionPreviewExecutionHistory
): MotionPreviewExecutionHistoryEntry | null {
  return (
    executionHistory.entries.find(
      (entry) => entry.gateId === 'drafts' && entry.label === action.label
    ) ?? null
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
