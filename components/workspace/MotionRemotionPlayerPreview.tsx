'use client';

import { useMemo, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { MotionPreparedPreviewSource } from '@/lib/motion/start';
import {
  DEFAULT_MOTION_FPS,
  type MotionAspectRatio,
  type TimelineClip,
  type TimelineTrack,
} from '@/lib/motion/project';

interface PreparedTimelineSource {
  compositionId: string;
  fps: number;
  durationFrames: number;
  initialFrame: number;
  focusedClipLabel: string | null;
  tracks: TimelineTrack[];
}

interface RemotionTimelineCompositionProps {
  compositionId: string;
  tracks: TimelineTrack[];
}

export interface MotionTimelinePlayerProps {
  compositionId: string;
  tracks: TimelineTrack[];
  aspectRatio?: MotionAspectRatio;
  fps?: number;
  durationFrames?: number;
  selectedClipId?: string | null;
  autoPlay?: boolean;
  className?: string;
  playerRef?: RefObject<PlayerRef | null>;
}

export function MotionRemotionPlayerPreview({
  source,
  selectedClipId = null,
}: {
  source: MotionPreparedPreviewSource;
  selectedClipId?: string | null;
}) {
  const timeline = useMemo(
    () => preparedTimelineSource(source, selectedClipId),
    [source, selectedClipId]
  );

  if (!timeline) return null;

  return (
    <section
      aria-label="Remotion Player preview"
      role="region"
      className="mt-3 overflow-hidden rounded-sm border border-border-soft bg-surface-canvas"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft px-2 py-1 font-mono text-2xs uppercase tracking-wide text-ink-dim">
        <span>{timeline.compositionId}</span>
        {timeline.focusedClipLabel ? <span>{timeline.focusedClipLabel}</span> : null}
      </div>
      <MotionTimelinePlayer
        compositionId={timeline.compositionId}
        tracks={timeline.tracks}
        durationFrames={timeline.durationFrames}
        fps={timeline.fps}
        selectedClipId={selectedClipId}
        className="max-h-[360px]"
      />
    </section>
  );
}

export function MotionTimelinePlayer({
  compositionId,
  tracks,
  aspectRatio = '9:16',
  fps = DEFAULT_MOTION_FPS,
  durationFrames,
  selectedClipId = null,
  autoPlay = false,
  className,
  playerRef,
}: MotionTimelinePlayerProps) {
  const dimensions = compositionDimensions(aspectRatio);
  const resolvedDurationFrames =
    durationFrames ??
    Math.max(
      1,
      ...tracks.flatMap((track) =>
        track.clips.map((clip) => clip.startFrame + clip.durationFrames)
      )
    );
  const selectedClip = selectedTimelineClip(tracks, selectedClipId);
  const initialFrame = clampFrame(
    selectedClip
      ? selectedClip.startFrame +
          Math.min(Math.round(fps * 0.6), Math.max(0, selectedClip.durationFrames - 1))
      : 0,
    resolvedDurationFrames
  );

  return (
    <Player
      ref={playerRef}
      key={`${compositionId}:${aspectRatio}:${initialFrame}:${resolvedDurationFrames}`}
      component={RemotionTimelineComposition}
      acknowledgeRemotionLicense
      compositionHeight={dimensions.height}
      compositionWidth={dimensions.width}
      controls
      autoPlay={autoPlay}
      durationInFrames={resolvedDurationFrames}
      fps={fps}
      initialFrame={initialFrame}
      inputProps={{ compositionId, tracks }}
      className={className}
      style={{
        aspectRatio: `${dimensions.width} / ${dimensions.height}`,
        backgroundColor: '#0f0d0c',
        height: '100%',
        maxWidth: '100%',
        width: '100%',
      }}
    />
  );
}

function RemotionTimelineComposition({
  compositionId,
  tracks,
}: RemotionTimelineCompositionProps) {
  const visualClips = tracks
    .filter((track) => ['screen', 'broll', 'text'].includes(track.kind))
    .flatMap((track) => track.clips.map((clip) => ({ clip, trackKind: track.kind })));
  const captionClips = tracks
    .filter((track) => track.kind === 'caption')
    .flatMap((track) => track.clips);
  const transitions = tracks
    .filter((track) => track.kind === 'transition')
    .flatMap((track) => track.clips);

  return (
    <AbsoluteFill
      style={{
        background: '#0f0d0c',
        color: '#f0e8da',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ inset: 0, position: 'absolute' }}>
        <div
          style={{
            color: '#c0b6a6',
            fontSize: 28,
            left: 72,
            letterSpacing: 0,
            position: 'absolute',
            textTransform: 'uppercase',
            top: 64,
            zIndex: 20,
          }}
        >
          {compositionId}
        </div>
      </div>
      {visualClips.map(({ clip, trackKind }) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
          <PreviewClipCard clip={clip} trackKind={trackKind} />
        </Sequence>
      ))}
      {captionClips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationFrames}
        >
          <PreviewCaption clip={clip} />
        </Sequence>
      ))}
      {transitions.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationFrames}
        >
          <PreviewTransition clip={clip} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function PreviewClipCard({
  clip,
  trackKind,
}: {
  clip: TimelineClip;
  trackKind: TimelineTrack['kind'];
}) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const landscape = width > height;
  const progress = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const text = clipPreviewText(clip);
  const accent = clipAccent(clip, trackKind);
  const assetUrl = browserAssetUrl(clip.props.assetUrl);
  const componentId = clip.componentId ?? trackKind;
  const isAppSurface = ['app-frame', 'ui-reveal-frame', 'device-frame'].includes(componentId);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        opacity: Math.min(1, 0.2 + progress),
        padding: landscape ? '120px 110px 150px' : '180px 72px 250px',
        transform: `translateY(${(1 - progress) * 48}px)`,
      }}
    >
      <div
        style={{
          alignItems: isAppSurface ? 'stretch' : 'flex-start',
          background: assetUrl ? '#181614' : '#181614ee',
          border: `3px solid ${accent}`,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          height: isAppSurface ? '72%' : 'auto',
          justifyContent: isAppSurface ? 'flex-end' : 'center',
          maxWidth: 1000,
          minHeight: isAppSurface
            ? landscape
              ? 430
              : 720
            : landscape
              ? 260
              : 320,
          overflow: 'hidden',
          padding: assetUrl ? 0 : '46px 50px',
          position: 'relative',
          width: '100%',
        }}
      >
        {assetUrl ? (
          <Img
            alt=""
            src={assetUrl}
            style={{ height: '100%', objectFit: 'cover', position: 'absolute', width: '100%' }}
          />
        ) : null}
        <div
          style={{
            background: assetUrl ? '#0f0d0ce6' : 'transparent',
            marginTop: assetUrl ? 'auto' : 0,
            padding: assetUrl ? '34px 38px' : 0,
            position: 'relative',
            width: '100%',
            zIndex: 2,
          }}
        >
          <div
            style={{
              color: accent,
              fontSize: 28,
              letterSpacing: 0,
              marginBottom: 22,
              textTransform: 'uppercase',
            }}
          >
            {componentId}
          </div>
          <div
            style={{
              fontSize: isAppSurface ? (landscape ? 48 : 54) : landscape ? 66 : 78,
              fontWeight: 700,
              letterSpacing: 0,
              lineHeight: 1.05,
            }}
          >
            {text}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function PreviewCaption({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const landscape = width > height;
  const progress = spring({ frame, fps, config: { damping: 20, stiffness: 150 } });

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'flex-end',
        padding: landscape ? '0 110px 54px' : '0 72px 90px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: '#f0e8da',
          borderRadius: 8,
          color: '#0f0d0c',
          fontSize: 34,
          fontWeight: 650,
          lineHeight: 1.2,
          maxWidth: 920,
          opacity: progress,
          padding: '18px 24px',
          textAlign: 'center',
          transform: `translateY(${(1 - progress) * 24}px)`,
        }}
      >
        {clipPreviewText(clip)}
      </div>
    </AbsoluteFill>
  );
}

function PreviewTransition({ clip }: { clip: TimelineClip }) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, clip.durationFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: '#3c4a5c',
        clipPath: `inset(0 ${Math.max(0, (1 - progress) * 100)}% 0 0)`,
        opacity: 0.92,
        pointerEvents: 'none',
      }}
    />
  );
}

function preparedTimelineSource(
  source: MotionPreparedPreviewSource,
  selectedClipId: string | null
): PreparedTimelineSource | null {
  const timelineFile =
    source.sourceFiles.find((file) => file.kind === 'timeline') ??
    source.sourceFiles.find((file) => file.path === source.sourceHost.timelinePath);

  if (!timelineFile) return null;

  try {
    const parsed = JSON.parse(timelineFile.contents) as Partial<PreparedTimelineSource>;
    if (!Array.isArray(parsed.tracks)) return null;
    const durationFrames =
      numericValue(parsed.durationFrames) ??
      Math.max(1, Math.round(source.durationSeconds * source.fps));
    const fps = numericValue(parsed.fps) ?? source.fps;
    const selectedClip = selectedTimelineClip(parsed.tracks, selectedClipId);
    const initialFrame = clampFrame(selectedClip?.startFrame ?? 0, durationFrames);

    return {
      compositionId: stringValue(parsed.compositionId) ?? source.compositionId,
      durationFrames,
      fps,
      initialFrame,
      focusedClipLabel: selectedClip
        ? `focus ${selectedClip.componentId ?? selectedClip.id} @ ${formatTimelineSeconds(initialFrame, fps)}`
        : null,
      tracks: parsed.tracks,
    };
  } catch {
    return null;
  }
}

function selectedTimelineClip(
  tracks: TimelineTrack[],
  selectedClipId: string | null
): TimelineClip | null {
  if (!selectedClipId) return null;

  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === selectedClipId);
    if (clip) return clip;
  }

  return null;
}

function clampFrame(frame: number, durationFrames: number): number {
  return Math.max(0, Math.min(frame, Math.max(0, durationFrames - 1)));
}

function formatTimelineSeconds(frame: number, fps: number): string {
  return `${(frame / fps).toFixed(1)}s`;
}

function clipPreviewText(clip: TimelineClip): string {
  const value =
    clip.props.caption ??
    clip.props.headline ??
    clip.props.text ??
    clip.props.narration ??
    clip.props.command;
  return typeof value === 'string' && value.trim().length > 0 ? value : clip.id;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function compositionDimensions(aspectRatio: MotionAspectRatio): {
  width: number;
  height: number;
} {
  if (aspectRatio === '16:9') return { width: 1920, height: 1080 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  if (aspectRatio === '4:5') return { width: 1080, height: 1350 };
  return { width: 1080, height: 1920 };
}

function clipAccent(clip: TimelineClip, trackKind: TimelineTrack['kind']): string {
  if (trackKind === 'screen' || trackKind === 'broll') return '#7c9885';
  if (clip.componentId?.includes('code') || clip.componentId?.includes('terminal')) {
    return '#8ca2bc';
  }
  if (clip.componentId?.includes('proof') || clip.componentId?.includes('evidence')) {
    return '#7c9885';
  }
  return '#d87040';
}

function browserAssetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^(https?:|data:image\/|blob:)/i.test(value) ? value : null;
}
