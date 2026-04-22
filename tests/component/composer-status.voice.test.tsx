import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ComposerStatus } from '@/components/composer/ComposerStatus';
import {
  resetVoiceCaptionForTests,
  setVoiceState,
  setVoiceToolCall,
  setVoiceTranscript,
  setVoiceError,
} from '@/lib/voice/caption-store';
import { resetRunsForTests } from '@/lib/store/runs';

afterEach(() => {
  cleanup();
  resetRunsForTests();
  resetVoiceCaptionForTests();
});

describe('ComposerStatus · voice caption (taxonomy=metadata, no new panel)', () => {
  it('falls back to the idle line when the voice caption store is empty', () => {
    render(<ComposerStatus />);
    expect(screen.getByText(/idle · type a prompt to begin/i)).toBeInTheDocument();
  });

  it('shows "voice · listening" when the orb starts capturing', () => {
    render(<ComposerStatus />);
    act(() => {
      setVoiceState('listening');
    });
    expect(screen.getByText(/voice · listening/i)).toBeInTheDocument();
  });

  it('renders user transcript + last tool call inline, in the existing metadata surface', () => {
    render(<ComposerStatus />);
    act(() => {
      setVoiceState('thinking');
      setVoiceTranscript('user', 'remove the background');
      setVoiceToolCall('remove_background', true, 'dispatched segmentation');
    });
    const caption = screen.getByText(/voice · thinking/i);
    expect(caption).toBeInTheDocument();
    expect(caption.closest('[data-voice-caption]')).toHaveAttribute(
      'data-taxonomy',
      'metadata'
    );
    expect(caption.textContent).toMatch(/✓ remove_background/);
    expect(caption.textContent).toMatch(/you: remove the background/);
  });

  it('shows the error variant when the voice layer reports a failure', () => {
    render(<ComposerStatus />);
    act(() => {
      setVoiceState('idle');
      setVoiceError('mic denied');
    });
    expect(screen.getByText(/error: mic denied/i)).toBeInTheDocument();
  });
});
