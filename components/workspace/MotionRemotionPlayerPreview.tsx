'use client';

import { useMemo } from 'react';
import { Player } from '@remotion/player';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionPreparedPreviewSource } from '@/lib/motion/start';
import type { TimelineClip, TimelineTrack } from '@/lib/motion/project';

interface PreparedTimelineSource {
  compositionId: string;
  fps: number;
  durationFrames: number;
  tracks: TimelineTrack[];
}

interface RemotionTimelineCompositionProps {
  compositionId: string;
  tracks: TimelineTrack[];
}

export function MotionRemotionPlayerPreview({
  source,
}: {
  source: MotionPreparedPreviewSource;
}) {
  const timeline = useMemo(() => preparedTimelineSource(source), [source]);

  if (!timeline) return null;

  return (
    <section
      aria-label="Remotion Player preview"
      role="region"
      className="mt-3 overflow-hidden rounded-sm border border-border-soft bg-surface-canvas"
    >
      <div className="border-b border-border-soft px-2 py-1 font-mono text-2xs uppercase tracking-wide text-ink-dim">
        {timeline.compositionId}
      </div>
      <Player
        component={RemotionTimelineComposition}
        compositionHeight={1920}
        compositionWidth={1080}
        controls
        durationInFrames={timeline.durationFrames}
        fps={timeline.fps}
        inputProps={{ compositionId: timeline.compositionId, tracks: timeline.tracks }}
        style={{
          aspectRatio: '9 / 16',
          backgroundColor: '#101113',
          maxHeight: 360,
          width: '100%',
        }}
      />
    </section>
  );
}

function RemotionTimelineComposition({
  compositionId,
  tracks,
}: RemotionTimelineCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const activeClips = tracks.flatMap((track) =>
    track.clips.map((clip) => ({ clip, trackKind: track.kind }))
  );

  return (
    <AbsoluteFill
      style={{
        background: '#101113',
        color: '#f6f3eb',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 96,
      }}
    >
      <div
        style={{
          color: '#f6f3eb99',
          fontSize: 34,
          letterSpacing: 0,
          marginBottom: 56,
          textTransform: 'uppercase',
        }}
      >
        {compositionId}
      </div>
      {activeClips.map(({ clip, trackKind }) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationFrames}>
          <PreviewClipCard clip={clip} trackKind={trackKind} progress={entrance} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function PreviewClipCard({
  clip,
  trackKind,
  progress,
}: {
  clip: TimelineClip;
  trackKind: TimelineTrack['kind'];
  progress: number;
}) {
  const text = clipPreviewText(clip);
  const accent = trackKind === 'caption' ? '#8fd4ff' : trackKind === 'voice' ? '#f5d36c' : '#ff8a66';

  return (
    <AbsoluteFill
      style={{
        alignItems: 'flex-start',
        display: 'flex',
        justifyContent: 'center',
        opacity: Math.min(1, 0.2 + progress),
        paddingTop: 480,
        transform: `translateY(${(1 - progress) * 48}px)`,
      }}
    >
      <div
        style={{
          border: `3px solid ${accent}`,
          borderRadius: 18,
          maxWidth: 860,
          padding: '42px 46px',
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: 30,
            letterSpacing: 0,
            marginBottom: 24,
            textTransform: 'uppercase',
          }}
        >
          {clip.componentId ?? trackKind}
        </div>
        <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: 0, lineHeight: 1.03 }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function preparedTimelineSource(source: MotionPreparedPreviewSource): PreparedTimelineSource | null {
  const timelineFile =
    source.sourceFiles.find((file) => file.kind === 'timeline') ??
    source.sourceFiles.find((file) => file.path === source.sourceHost.timelinePath);

  if (!timelineFile) return null;

  try {
    const parsed = JSON.parse(timelineFile.contents) as Partial<PreparedTimelineSource>;
    if (!Array.isArray(parsed.tracks)) return null;
    return {
      compositionId: stringValue(parsed.compositionId) ?? source.compositionId,
      durationFrames:
        numericValue(parsed.durationFrames) ?? Math.max(1, Math.round(source.durationSeconds * source.fps)),
      fps: numericValue(parsed.fps) ?? source.fps,
      tracks: parsed.tracks,
    };
  } catch {
    return null;
  }
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
