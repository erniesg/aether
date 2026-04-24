import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AirBrushOverlay } from '@/components/canvas/AirBrushOverlay';
import type { CreateAirBrushHandLandmarker } from '@/lib/canvas/mediaPipeHandLandmarker';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installMediaDevices(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
    },
  });
}

const noFingerTracking: CreateAirBrushHandLandmarker = async () => {
  throw new Error('finger tracking unavailable');
};

describe('AirBrushOverlay', () => {
  it('requests the browser camera and exposes pointer fallback status', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    })) as unknown as () => Promise<MediaStream>;
    installMediaDevices(getUserMedia);

    render(<AirBrushOverlay active createHandLandmarker={noFingerTracking} />);

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: 'user' },
        audio: false,
      });
    });

    expect(
      await screen.findByText(/air brush · pointer fallback/i)
    ).toBeInTheDocument();

    cleanup();
    expect(stop).toHaveBeenCalled();
  });

  it('lets the creator keep drawing with pointer fallback when no camera exists', async () => {
    installMediaDevices(vi.fn(async () => {
      throw new Error('no camera');
    }) as unknown as () => Promise<MediaStream>);

    render(<AirBrushOverlay active createHandLandmarker={noFingerTracking} />);

    expect(
      await screen.findByText(/air brush · pointer fallback/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument();
  });

  it('does not request the camera until air brush mode is active', async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [],
    })) as unknown as () => Promise<MediaStream>;
    installMediaDevices(getUserMedia);

    render(
      <AirBrushOverlay
        active={false}
        onActiveChange={onActiveChange}
        createHandLandmarker={noFingerTracking}
      />
    );

    expect(getUserMedia).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /turn on air brush/i }));

    expect(onActiveChange).toHaveBeenCalledWith(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('captures the current camera frame as a composer reference', async () => {
    const user = userEvent.setup();
    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })) as unknown as () => Promise<MediaStream>
    );
    const onCapture = vi.fn();

    render(
      <AirBrushOverlay
        active
        onCapture={onCapture}
        createHandLandmarker={noFingerTracking}
      />
    );

    await screen.findByText(/air brush · pointer fallback/i);
    await user.click(
      screen.getByRole('button', { name: /capture air brush reference/i })
    );

    expect(onCapture).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png/));
  });

  it('emits MediaPipe index-finger points when landmark tracking is ready', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);

    const stop = vi.fn();
    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop }],
      })) as unknown as () => Promise<MediaStream>
    );
    const onPoint = vi.fn();
    const detectForVideo = vi.fn(() => ({
      landmarks: [
        Array.from({ length: 21 }, (_, index) => ({
          x: index === 8 ? 0.25 : 0.5,
          y: index === 8 ? 0.4 : 0.5,
          z: 0,
          visibility: 0.95,
        })),
      ],
      handedness: [[{ score: 0.95 }]],
    }));

    render(
      <AirBrushOverlay
        active
        onPoint={onPoint}
        createHandLandmarker={async () => ({
          detectForVideo,
          close: vi.fn(),
        })}
      />
    );

    expect(await screen.findByText(/draw with finger/i)).toBeInTheDocument();
    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));

    act(() => {
      rafCallbacks.shift()?.(100);
    });

    await waitFor(() => {
      expect(onPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0.75,
          y: 0.4,
          state: 'start',
          source: 'camera',
        })
      );
    });
  });
});
