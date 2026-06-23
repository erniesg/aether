import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineLens } from '@/components/workspace/TimelineLens';
import type { TimelineTrack } from '@/lib/motion/project';

afterEach(cleanup);

const tracks: TimelineTrack[] = [
  {
    id: 'track-text',
    kind: 'text',
    clips: [
      {
        id: 'clip-hook',
        componentId: 'hook-card',
        startFrame: 0,
        durationFrames: 90,
        props: { narration: 'Launch with receipts.', role: 'hook' },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
      },
    ],
  },
  {
    id: 'track-voice',
    kind: 'voice',
    clips: [
      {
        id: 'clip-voice',
        componentId: 'voice-line',
        startFrame: 0,
        durationFrames: 90,
        props: { text: 'Launch with receipts.', status: 'planned' },
        linkedVariantScope: 'global',
        provenance: [{ kind: 'story-beat', ref: 'beat-hook' }],
      },
    ],
  },
];

describe('TimelineLens', () => {
  it('renders creator-facing tracks and clips without raw provenance refs', () => {
    render(<TimelineLens tracks={tracks} selectedClipId={null} onSelectClip={() => {}} />);

    expect(screen.getByRole('region', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('voice')).toBeInTheDocument();
    expect(screen.getByText('Launch with receipts.')).toBeInTheDocument();
    expect(screen.getByText('Hook card')).toBeInTheDocument();
    expect(screen.queryByText('beat-hook')).not.toBeInTheDocument();
    expect(screen.queryByText('clip-hook')).not.toBeInTheDocument();
  });

  it('selects a clip from the timeline', async () => {
    const onSelectClip = vi.fn<(clipId: string) => void>();
    render(<TimelineLens tracks={tracks} selectedClipId={null} onSelectClip={onSelectClip} />);

    await userEvent.click(screen.getByRole('button', { name: /hook card/i }));
    expect(onSelectClip).toHaveBeenCalledWith('clip-hook');
  });
});
