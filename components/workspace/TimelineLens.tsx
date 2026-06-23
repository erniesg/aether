'use client';

import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { getMotionComponent } from '@/lib/motion/componentRegistry';
import type { TimelineClip, TimelineTrack } from '@/lib/motion/project';
import { motionSeconds } from '@/lib/motion/project';
import { cn } from '@/lib/utils/cn';

export interface TimelineLensProps {
  tracks: TimelineTrack[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
}

export function TimelineLens({
  tracks,
  selectedClipId,
  onSelectClip,
}: TimelineLensProps) {
  const clipCount = tracks.reduce((total, track) => total + track.clips.length, 0);

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
            {tracks.length} tracks
          </Chip>
        </div>
        <Chip tone={clipCount > 0 ? 'ok' : 'neutral'} size="sm">
          {clipCount} clips
        </Chip>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tracks.length > 0 ? (
          tracks.map((track) => (
            <TimelineTrackRow
              key={track.id}
              track={track}
              selectedClipId={selectedClipId}
              onSelectClip={onSelectClip}
            />
          ))
        ) : (
          <div className="flex min-h-[220px] flex-1 items-center justify-center px-6 text-center font-caption text-sm text-ink-faint">
            no clips staged
          </div>
        )}
      </div>
    </Surface>
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
  if (typeof clip.props.narration === 'string') return clip.props.narration;
  if (typeof clip.props.text === 'string' && clip.componentId !== 'voice-line') {
    return clip.props.text;
  }
  if (typeof clip.props.status === 'string') return clip.props.status;
  if (typeof clip.props.role === 'string') return clip.props.role;
  return '';
}
