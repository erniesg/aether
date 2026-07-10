'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { PlayerRef } from '@remotion/player';
import {
  Check,
  Download,
  Film,
  Play,
  RefreshCw,
  SquareStack,
} from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { MotionTimelinePlayer } from '@/components/workspace/MotionRemotionPlayerPreview';
import {
  motionFrames,
  motionSeconds,
  type MotionAspectRatio,
  type TimelineTrack,
} from '@/lib/motion/project';
import type {
  MotionPreviewEnginePlan,
  MotionPreviewExportPackCanvasDropTarget,
  MotionPreviewPlan,
  MotionPreviewRenderProofCanvasDropTarget,
  MotionPreviewTimelineClip,
  MotionPreviewVideoPlanScene,
} from '@/lib/motion/previewPlan';
import type { MotionRenderEngine } from '@/lib/providers/video/types';
import { cn } from '@/lib/utils/cn';

const ASPECTS: MotionAspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

export interface MotionCanvasVideoEditorProps {
  previewPlan: MotionPreviewPlan;
  tracks: TimelineTrack[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSelectDraft?: (draftId: string) => void;
  onApproveDraft?: (draftId: string) => void;
  onRegenerateComponent?: (actionId: string) => void;
  onRenderMotion?: (engine: MotionRenderEngine) => void;
  onExportPack?: () => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
  onDropRenderProofToCanvas?: (target: MotionPreviewRenderProofCanvasDropTarget) => void;
  onDropExportPackToCanvas?: (target: MotionPreviewExportPackCanvasDropTarget) => void;
  inspector?: ReactNode;
  actionStatus?: string | null;
}

export function MotionCanvasVideoEditor({
  previewPlan,
  tracks,
  selectedClipId,
  onSelectClip,
  onSelectDraft,
  onApproveDraft,
  onRegenerateComponent,
  onRenderMotion,
  onExportPack,
  onEditClipTiming,
  onDropRenderProofToCanvas,
  onDropExportPackToCanvas,
  inspector,
  actionStatus,
}: MotionCanvasVideoEditorProps) {
  const editorTracks = useMemo(
    () => (tracks.length > 0 ? tracks : editorTracksFromPreview(previewPlan)),
    [previewPlan, tracks]
  );
  const sceneClips = useMemo(() => editorSceneClips(previewPlan), [previewPlan]);
  const selectedClip =
    findPreviewClip(previewPlan, selectedClipId) ?? sceneClips[0]?.clip ?? null;
  const selectedScene = selectedClip
    ? nearestScene(previewPlan.videoPlan.scenes, selectedClip.startSeconds)
    : previewPlan.videoPlan.scenes[0] ?? null;
  const [aspectRatio, setAspectRatio] = useState<MotionAspectRatio>(() =>
    targetAspectRatio(previewPlan.summary.targetPlatforms)
  );
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const playerRef = useRef<PlayerRef>(null);
  const pendingSeekSeconds = useRef<number | null>(null);
  const currentDraft = previewPlan.draftOptions.find((draft) => draft.isCurrent) ?? null;
  const renderEngine = preferredEditorEngine(previewPlan.enginePreviews);
  const firstExportCanvasTarget = previewPlan.exportPackSummary.canvasDropTargets[0] ?? null;
  const firstRenderCanvasTarget = previewPlan.renderProofSummary.canvasDropTargets[0] ?? null;
  const durationSeconds = editorDurationSeconds(previewPlan);

  useEffect(() => {
    const nextSeconds = selectedClip?.startSeconds ?? 0;
    setPlayheadSeconds(nextSeconds);
    if (playerOpen) playerRef.current?.seekTo(motionFrames(nextSeconds));
  }, [playerOpen, selectedClip?.clipId, selectedClip?.startSeconds]);

  useEffect(() => {
    if (!playerOpen || !playerRef.current) return;
    const player = playerRef.current;
    const handleFrameUpdate = (event: { detail: { frame: number } }) => {
      setPlayheadSeconds(motionSeconds(event.detail.frame));
    };
    player.addEventListener('frameupdate', handleFrameUpdate);
    if (pendingSeekSeconds.current !== null) {
      player.seekTo(motionFrames(pendingSeekSeconds.current));
      pendingSeekSeconds.current = null;
    }
    return () => player.removeEventListener('frameupdate', handleFrameUpdate);
  }, [playerOpen, previewPlan.id]);

  useEffect(() => {
    setAspectRatio(targetAspectRatio(previewPlan.summary.targetPlatforms));
  }, [previewPlan.id, previewPlan.summary.targetPlatforms]);

  const seekTimeline = (seconds: number) => {
    const nextSeconds = Math.max(0, Math.min(seconds, durationSeconds));
    setPlayheadSeconds(nextSeconds);
    if (playerRef.current) {
      playerRef.current.seekTo(motionFrames(nextSeconds));
      return;
    }
    pendingSeekSeconds.current = nextSeconds;
    setPlayerOpen(true);
  };

  return (
    <section
      role="region"
      aria-label="video editor"
      className="flex min-h-[680px] flex-col border-b border-border-soft bg-surface-bg-muted"
    >
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-surface-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Film className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <div className="truncate font-caption text-sm text-ink">{previewPlan.title}</div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {previewPlan.videoPlan.sceneCount} scenes · {durationSeconds.toFixed(1)}s
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {currentDraft ? (
            <select
              aria-label="current video draft"
              value={currentDraft.draftId}
              onChange={(event) => onSelectDraft?.(event.target.value)}
              disabled={!onSelectDraft}
              className="h-8 max-w-[180px] rounded-sm border border-border-soft bg-surface-panel px-2 font-caption text-xs text-ink outline-none focus:border-accent"
            >
              {previewPlan.draftOptions.map((draft, index) => (
                <option key={draft.draftId} value={draft.draftId}>
                  {index + 1}. {draft.label}
                </option>
              ))}
            </select>
          ) : null}
          {currentDraft && onApproveDraft ? (
            <button
              type="button"
              disabled={currentDraft.status === 'approved'}
              onClick={() => onApproveDraft(currentDraft.draftId)}
              className="inline-flex h-8 items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              {currentDraft.status === 'approved' ? 'approved' : 'approve'}
            </button>
          ) : null}
          {renderEngine && onRenderMotion ? (
            <button
              type="button"
              onClick={() => onRenderMotion(renderEngine.engine)}
              className="inline-flex h-8 items-center gap-1 rounded-sm border border-border-soft bg-surface-panel px-2 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent-secondary hover:text-accent-secondary"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              render
            </button>
          ) : null}
          {onExportPack ? (
            <button
              type="button"
              onClick={onExportPack}
              className="inline-flex h-8 items-center gap-1 rounded-sm border border-accent bg-accent px-2 font-mono text-2xs uppercase tracking-wide text-ink-on-accent transition-colors hover:bg-accent-strong"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              export
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[176px_minmax(420px,1fr)_320px]">
        <aside className="min-h-0 border-b border-border-soft bg-surface-panel xl:border-b-0 xl:border-r">
          <div className="flex h-10 items-center justify-between border-b border-border-soft px-3">
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">scenes</span>
            <Chip tone="neutral" size="sm">
              {sceneClips.length}
            </Chip>
          </div>
          <ol className="flex gap-2 overflow-x-auto p-2 xl:grid xl:max-h-[478px] xl:overflow-y-auto">
            {sceneClips.map(({ scene, clip }, index) => {
              const selected = clip.clipId === selectedClip?.clipId;
              return (
                <li key={scene.sceneId} className="shrink-0 xl:shrink">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`select ${scene.role} scene`}
                    onClick={() => onSelectClip(clip.clipId)}
                    className={cn(
                      'grid h-[86px] w-[150px] grid-cols-[24px_minmax(0,1fr)] gap-2 overflow-hidden rounded-sm border p-2 text-left transition-colors xl:w-full',
                      selected
                        ? 'border-accent bg-accent/10 text-ink'
                        : 'border-border-soft bg-surface-panel-muted text-ink-dim hover:border-border-strong hover:text-ink'
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-surface-bg font-mono text-[10px] text-ink-faint">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-accent-secondary">
                        {scene.role}
                      </span>
                      <span className="mt-1 line-clamp-2 font-caption text-2xs">
                        {clip.summary || scene.narration}
                      </span>
                      <span className="mt-1 block font-mono text-[9px] text-ink-faint">
                        {scene.durationSeconds.toFixed(1)}s
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex min-h-[500px] min-w-0 flex-col bg-surface-bg-muted">
          <div className="flex h-10 items-center justify-between border-b border-border-soft px-3">
            <div className="flex items-center gap-1">
              {ASPECTS.map((aspect) => (
                <button
                  key={aspect}
                  type="button"
                  aria-pressed={aspectRatio === aspect}
                  onClick={() => setAspectRatio(aspect)}
                  className={cn(
                    'h-6 rounded-sm px-2 font-mono text-[10px] transition-colors',
                    aspectRatio === aspect
                      ? 'bg-surface-panel text-ink shadow-xs'
                      : 'text-ink-faint hover:text-ink'
                  )}
                >
                  {aspect}
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
              {formatEditorTime(playheadSeconds)} / {formatEditorTime(durationSeconds)}
            </span>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 lg:p-6">
            <div
              className="relative flex max-h-[430px] items-center justify-center overflow-hidden rounded-sm border border-border bg-[#0f0d0c] shadow-md"
              style={{
                aspectRatio: aspectRatio.replace(':', ' / '),
                width: stageWidth(aspectRatio),
              }}
            >
              {playerOpen ? (
                <MotionTimelinePlayer
                  compositionId={previewPlan.title}
                  tracks={editorTracks}
                  aspectRatio={aspectRatio}
                  selectedClipId={selectedClip?.clipId ?? null}
                  autoPlay
                  playerRef={playerRef}
                />
              ) : (
                <StaticSceneFrame
                  scene={selectedScene}
                  clip={selectedClip}
                  aspectRatio={aspectRatio}
                  onPlay={() => setPlayerOpen(true)}
                />
              )}
            </div>
          </div>

          <EditorTimeline
            tracks={previewPlan.timelineRows}
            durationSeconds={durationSeconds}
            playheadSeconds={playheadSeconds}
            selectedClipId={selectedClip?.clipId ?? null}
            onSelectClip={onSelectClip}
            onSeek={seekTimeline}
            onEditClipTiming={onEditClipTiming}
          />
        </div>

        <aside className="min-h-0 border-t border-border-soft bg-surface-panel xl:border-l xl:border-t-0">
          <div className="flex h-10 items-center justify-between border-b border-border-soft px-3">
            <span className="font-mono text-2xs uppercase tracking-wide text-ink-dim">scene</span>
            {selectedClip ? (
              <span className="truncate font-caption text-2xs text-ink-faint">
                {selectedClip.componentLabel}
              </span>
            ) : null}
          </div>
          <div className="max-h-[638px] overflow-y-auto">
            {inspector ?? (
              <div className="px-4 py-10 text-center font-caption text-xs text-ink-faint">
                select a scene to edit
              </div>
            )}
            {selectedClip && onRegenerateComponent ? (
              <div className="border-t border-border-soft px-3 py-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                  regenerate
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {previewPlan.regenerationActions
                    .filter((action) => action.requestTemplate.clipId === selectedClip.clipId)
                    .map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        aria-label={action.label}
                        onClick={() => onRegenerateComponent(action.id)}
                        className="inline-flex items-center gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-dim transition-colors hover:border-accent-tertiary hover:text-accent-tertiary"
                      >
                        <SquareStack className="h-3 w-3" aria-hidden="true" />
                        {action.scope}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}
            {(firstExportCanvasTarget && onDropExportPackToCanvas) ||
            (firstRenderCanvasTarget && onDropRenderProofToCanvas) ? (
              <div className="border-t border-border-soft p-3">
                <button
                  type="button"
                  onClick={() => {
                    if (firstExportCanvasTarget && onDropExportPackToCanvas) {
                      onDropExportPackToCanvas(firstExportCanvasTarget);
                    } else if (firstRenderCanvasTarget && onDropRenderProofToCanvas) {
                      onDropRenderProofToCanvas(firstRenderCanvasTarget);
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2 font-mono text-2xs uppercase tracking-wide text-ink-dim transition-colors hover:border-accent-tertiary hover:text-accent-tertiary"
                >
                  <SquareStack className="h-3 w-3" aria-hidden="true" />
                  {firstExportCanvasTarget ? 'place export on canvas' : 'place render on canvas'}
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {actionStatus ? (
        <div
          role="status"
          className="border-t border-border-soft bg-surface-panel px-3 py-2 font-caption text-xs text-ink-dim"
        >
          {actionStatus}
        </div>
      ) : null}
    </section>
  );
}

function StaticSceneFrame({
  scene,
  clip,
  aspectRatio,
  onPlay,
}: {
  scene: MotionPreviewVideoPlanScene | null;
  clip: MotionPreviewTimelineClip | null;
  aspectRatio: MotionAspectRatio;
  onPlay: () => void;
}) {
  const headline = clip?.summary || scene?.narration || 'Select a scene to begin editing.';

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden p-[7%] text-[#f0e8da]">
      <div className="absolute left-0 top-0 h-1.5 w-1/3 bg-[#d87040]" />
      <div className="absolute bottom-0 right-0 h-1.5 w-1/4 bg-[#7c9885]" />
      <div className="relative z-10 flex items-center justify-between gap-3 font-mono text-[clamp(9px,1.2vw,14px)] uppercase text-[#c0b6a6]">
        <span>{scene?.role ?? 'scene'}</span>
        <span>{clip?.componentLabel ?? 'select a scene'}</span>
      </div>
      <div className="relative z-10 max-w-[88%]">
        <div className="mb-3 h-1 w-10 bg-[#8ca2bc]" />
        <div
          className="text-balance font-sans font-semibold leading-[1.05]"
          style={{
            fontSize: staticSceneFontSize(aspectRatio, headline.length),
            overflowWrap: 'anywhere',
          }}
        >
          {headline}
        </div>
        <div className="mt-4 font-mono text-[clamp(9px,1.1vw,13px)] uppercase text-[#c0b6a6]">
          {scene?.visualLabel ?? clip?.componentLabel ?? 'editable motion scene'}
        </div>
      </div>
      <button
        type="button"
        aria-label="play editable timeline"
        title="Play editable timeline"
        onClick={onPlay}
        className="absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#f0e8da66] bg-[#0f0d0ccc] text-[#f0e8da] shadow-md transition-transform hover:scale-105"
      >
        <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  );
}

function EditorTimeline({
  tracks,
  durationSeconds,
  playheadSeconds,
  selectedClipId,
  onSelectClip,
  onSeek,
  onEditClipTiming,
}: {
  tracks: MotionPreviewPlan['timelineRows'];
  durationSeconds: number;
  playheadSeconds: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSeek: (seconds: number) => void;
  onEditClipTiming?: (clipId: string, startSeconds: number, durationSeconds: number) => void;
}) {
  const rulerSteps = Math.max(2, Math.ceil(durationSeconds / 5));
  const [drag, setDrag] = useState<TimelineDragState | null>(null);
  const playheadPercent = Math.min(100, Math.max(0, (playheadSeconds / durationSeconds) * 100));

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    clip: MotionPreviewTimelineClip
  ) => {
    if (!onEditClipTiming || event.button !== 0) return;
    const timelineWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    if (timelineWidth <= 0) return;
    const requestedMode = (event.target as HTMLElement).dataset.dragMode;
    const mode: TimelineDragMode =
      requestedMode === 'trim-start' || requestedMode === 'trim-end'
        ? requestedMode
        : 'move';
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      clipId: clip.clipId,
      mode,
      originX: event.clientX,
      timelineWidth,
      originalStartSeconds: clip.startSeconds,
      originalDurationSeconds: clip.durationSeconds,
      previewStartSeconds: clip.startSeconds,
      previewDurationSeconds: clip.durationSeconds,
    });
  };

  const updateDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((current) => {
      if (!current || current.clipId !== event.currentTarget.dataset.clipId) return current;
      const deltaSeconds =
        ((event.clientX - current.originX) / current.timelineWidth) * durationSeconds;
      const timing = draggedClipTiming(current, deltaSeconds, durationSeconds);
      return {
        ...current,
        previewStartSeconds: timing.startSeconds,
        previewDurationSeconds: timing.durationSeconds,
      };
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.clipId !== event.currentTarget.dataset.clipId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (
      drag.previewStartSeconds !== drag.originalStartSeconds ||
      drag.previewDurationSeconds !== drag.originalDurationSeconds
    ) {
      onSelectClip(drag.clipId);
      onEditClipTiming?.(
        drag.clipId,
        drag.previewStartSeconds,
        drag.previewDurationSeconds
      );
    }
    setDrag(null);
  };

  const nudgeClip = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    clip: MotionPreviewTimelineClip
  ) => {
    if (!onEditClipTiming || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 0.1 : -0.1;
    if (event.shiftKey) {
      onEditClipTiming(
        clip.clipId,
        clip.startSeconds,
        quantizeSeconds(Math.max(0.2, clip.durationSeconds + delta))
      );
      return;
    }
    onEditClipTiming(
      clip.clipId,
      quantizeSeconds(Math.max(0, clip.startSeconds + delta)),
      clip.durationSeconds
    );
  };

  return (
    <section aria-label="editable tracks" className="border-t border-border-soft bg-surface-panel">
      <div className="max-h-[184px] overflow-auto">
        <div className="min-w-[720px]">
          <div className="grid h-8 grid-cols-[76px_minmax(0,1fr)] border-b border-border-soft">
            <div className="flex items-center border-r border-border-soft px-2 font-mono text-[9px] uppercase text-ink-faint">
              playhead
            </div>
            <div className="flex items-center px-2">
              <input
                aria-label="video playhead"
                type="range"
                min={0}
                max={durationSeconds}
                step={0.1}
                value={Math.min(durationSeconds, playheadSeconds)}
                onChange={(event) => onSeek(Number(event.target.value))}
                className="h-4 w-full accent-accent"
              />
            </div>
          </div>
          <div className="grid h-7 grid-cols-[76px_minmax(0,1fr)] border-b border-border-soft">
            <div className="border-r border-border-soft" />
            <div className="relative font-mono text-[9px] text-ink-faint">
              {Array.from({ length: rulerSteps + 1 }, (_, index) => {
                const seconds = Math.min(durationSeconds, index * 5);
                return (
                  <span
                    key={`${seconds}-${index}`}
                    className="absolute top-1 -translate-x-1/2"
                    style={{ left: `${(seconds / durationSeconds) * 100}%` }}
                  >
                    {seconds}s
                  </span>
                );
              })}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-accent"
                style={{ left: `${playheadPercent}%` }}
              />
            </div>
          </div>
          {tracks.map((track) => (
            <div
              key={track.trackId}
              className="grid h-9 grid-cols-[76px_minmax(0,1fr)] border-b border-border-soft last:border-b-0"
            >
              <div className="flex items-center border-r border-border-soft bg-surface-panel-muted px-2 font-mono text-[9px] uppercase text-ink-faint">
                {track.trackKind}
              </div>
              <div className="relative">
                {track.clips.map((clip) => {
                  const preview =
                    drag?.clipId === clip.clipId
                      ? {
                          startSeconds: drag.previewStartSeconds,
                          durationSeconds: drag.previewDurationSeconds,
                        }
                      : clip;
                  const left = (preview.startSeconds / durationSeconds) * 100;
                  const width = Math.max(
                    1.2,
                    (preview.durationSeconds / durationSeconds) * 100
                  );
                  const selected = clip.clipId === selectedClipId;
                  return (
                    <button
                      key={clip.clipId}
                      type="button"
                      data-clip-id={clip.clipId}
                      aria-label={`select ${clip.componentLabel} timeline clip`}
                      aria-pressed={selected}
                      aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
                      title={`${clip.componentLabel} · ${preview.durationSeconds.toFixed(1)}s · drag to move · handles trim`}
                      onClick={() => onSelectClip(clip.clipId)}
                      onKeyDown={(event) => nudgeClip(event, clip)}
                      onPointerDown={(event) => beginDrag(event, clip)}
                      onPointerMove={updateDrag}
                      onPointerUp={finishDrag}
                      onPointerCancel={() => setDrag(null)}
                      className={cn(
                        'group absolute bottom-1 top-1 touch-none overflow-hidden rounded-xs border px-1 text-left font-caption text-[9px] transition-colors',
                        selected
                          ? 'z-10 border-accent bg-accent/25 text-ink'
                          : track.trackKind === 'transition'
                            ? 'border-accent-secondary/50 bg-accent-secondary/20 text-ink-dim'
                            : track.trackKind === 'caption'
                              ? 'border-accent-tertiary/50 bg-accent-tertiary/20 text-ink-dim'
                              : 'border-border bg-surface-bg-muted text-ink-dim hover:border-border-strong'
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className="block truncate">{clip.summary || clip.componentLabel}</span>
                      {selected && onEditClipTiming ? (
                        <>
                          <span
                            data-drag-mode="trim-start"
                            aria-hidden="true"
                            className="absolute bottom-0 left-0 top-0 w-1.5 cursor-col-resize bg-accent/70"
                          />
                          <span
                            data-drag-mode="trim-end"
                            aria-hidden="true"
                            className="absolute bottom-0 right-0 top-0 w-1.5 cursor-col-resize bg-accent/70"
                          />
                        </>
                      ) : null}
                    </button>
                  );
                })}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-accent/80"
                  style={{ left: `${playheadPercent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type TimelineDragMode = 'move' | 'trim-start' | 'trim-end';

interface TimelineDragState {
  clipId: string;
  mode: TimelineDragMode;
  originX: number;
  timelineWidth: number;
  originalStartSeconds: number;
  originalDurationSeconds: number;
  previewStartSeconds: number;
  previewDurationSeconds: number;
}

function draggedClipTiming(
  drag: TimelineDragState,
  deltaSeconds: number,
  durationSeconds: number
): { startSeconds: number; durationSeconds: number } {
  if (drag.mode === 'trim-start') {
    const endSeconds = drag.originalStartSeconds + drag.originalDurationSeconds;
    const startSeconds = quantizeSeconds(
      Math.max(0, Math.min(endSeconds - 0.2, drag.originalStartSeconds + deltaSeconds))
    );
    return {
      startSeconds,
      durationSeconds: quantizeSeconds(Math.max(0.2, endSeconds - startSeconds)),
    };
  }
  if (drag.mode === 'trim-end') {
    return {
      startSeconds: drag.originalStartSeconds,
      durationSeconds: quantizeSeconds(
        Math.max(
          0.2,
          Math.min(
            durationSeconds - drag.originalStartSeconds,
            drag.originalDurationSeconds + deltaSeconds
          )
        )
      ),
    };
  }
  return {
    startSeconds: quantizeSeconds(
      Math.max(
        0,
        Math.min(
          durationSeconds - drag.originalDurationSeconds,
          drag.originalStartSeconds + deltaSeconds
        )
      )
    ),
    durationSeconds: drag.originalDurationSeconds,
  };
}

function quantizeSeconds(value: number): number {
  return Math.round(value * 10) / 10;
}

export function editorTracksFromPreview(previewPlan: MotionPreviewPlan): TimelineTrack[] {
  return previewPlan.timelineRows.map((row) => ({
    id: row.trackId,
    kind: row.trackKind,
    clips: row.clips.map((clip) => ({
      id: clip.clipId,
      ...(clip.componentId ? { componentId: clip.componentId } : {}),
      startFrame: motionFrames(clip.startSeconds),
      durationFrames: Math.max(1, motionFrames(clip.durationSeconds)),
      props: {
        text: clip.summary,
        caption: clip.summary,
        ...(clip.effectPreset ? { effectPreset: clip.effectPreset } : {}),
      },
      linkedVariantScope: clip.linkedVariantScope,
      provenance: [{ kind: 'timeline', ref: clip.clipId }],
    })),
  }));
}

function editorSceneClips(
  previewPlan: MotionPreviewPlan
): Array<{ scene: MotionPreviewVideoPlanScene; clip: MotionPreviewTimelineClip }> {
  const primaryClips =
    previewPlan.timelineRows.find((row) =>
      ['screen', 'broll', 'text'].includes(row.trackKind)
    )?.clips ?? previewPlan.timelineRows.flatMap((row) => row.clips);

  return previewPlan.videoPlan.scenes.flatMap((scene, index) => {
    const clip =
      primaryClips.find(
        (candidate) => Math.abs(candidate.startSeconds - scene.startSeconds) < 0.05
      ) ?? primaryClips[index];
    return clip ? [{ scene, clip }] : [];
  });
}

function findPreviewClip(
  previewPlan: MotionPreviewPlan,
  clipId: string | null
): MotionPreviewTimelineClip | null {
  if (!clipId) return null;
  for (const row of previewPlan.timelineRows) {
    const clip = row.clips.find((candidate) => candidate.clipId === clipId);
    if (clip) return clip;
  }
  return null;
}

function nearestScene(
  scenes: MotionPreviewVideoPlanScene[],
  startSeconds: number
): MotionPreviewVideoPlanScene | null {
  return (
    scenes.reduce<MotionPreviewVideoPlanScene | null>((nearest, scene) => {
      if (!nearest) return scene;
      return Math.abs(scene.startSeconds - startSeconds) <
        Math.abs(nearest.startSeconds - startSeconds)
        ? scene
        : nearest;
    }, null) ?? null
  );
}

function editorDurationSeconds(previewPlan: MotionPreviewPlan): number {
  const trackDuration = Math.max(
    0,
    ...previewPlan.timelineRows.flatMap((row) =>
      row.clips.map((clip) => clip.startSeconds + clip.durationSeconds)
    )
  );
  return Math.max(1, trackDuration, previewPlan.summary.totalSeconds);
}

function targetAspectRatio(targets: string[]): MotionAspectRatio {
  for (const aspect of ASPECTS) {
    if (targets.some((target) => target.includes(aspect))) return aspect;
  }
  return '9:16';
}

function preferredEditorEngine(
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

function stageWidth(aspectRatio: MotionAspectRatio): string {
  if (aspectRatio === '9:16') return 'min(100%, 242px)';
  if (aspectRatio === '4:5') return 'min(100%, 344px)';
  if (aspectRatio === '1:1') return 'min(100%, 430px)';
  return 'min(100%, 760px)';
}

function formatEditorTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainingSeconds = clamped - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainingSeconds.toFixed(1).padStart(4, '0')}`;
}

function staticSceneFontSize(aspectRatio: MotionAspectRatio, textLength: number): number {
  if (aspectRatio === '9:16') {
    if (textLength > 90) return 21;
    if (textLength > 48) return 27;
    return 34;
  }
  if (aspectRatio === '4:5') return textLength > 90 ? 24 : 34;
  if (aspectRatio === '1:1') return textLength > 90 ? 26 : 38;
  return textLength > 120 ? 30 : textLength > 72 ? 38 : 46;
}
