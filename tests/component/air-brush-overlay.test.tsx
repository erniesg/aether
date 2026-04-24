import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AirBrushOverlay } from '@/components/canvas/AirBrushOverlay';
import type { AirBrushHandLandmark } from '@/lib/canvas/airBrush';
import type { CreateAirBrushHandLandmarker } from '@/lib/canvas/mediaPipeHandLandmarker';

afterEach(() => {
  cleanup();
  delete window.__AETHER_AIR_BRUSH_DEBUG__;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// jsdom doesn't implement HTMLMediaElement.play(); the overlay now calls it
// explicitly after attaching the stream to coax browsers out of a
// paused-but-ready state. Stub it to a resolved promise in every test.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
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

function trackedHand(
  overrides: Partial<Record<number, Partial<AirBrushHandLandmark>>> = {}
) {
  const landmarks = Array.from({ length: 21 }, () => ({
    x: 0.54,
    y: 0.74,
    z: 0,
    visibility: 0.95,
  }));
  landmarks[0] = { x: 0.52, y: 0.82, z: 0, visibility: 0.95 };
  landmarks[5] = { x: 0.46, y: 0.62, z: 0, visibility: 0.95 };
  landmarks[6] = { x: 0.44, y: 0.5, z: 0, visibility: 0.95 };
  landmarks[7] = { x: 0.39, y: 0.45, z: 0, visibility: 0.95 };
  landmarks[8] = { x: 0.25, y: 0.4, z: 0, visibility: 0.95 };
  landmarks[17] = { x: 0.64, y: 0.68, z: 0, visibility: 0.95 };

  for (const [index, patch] of Object.entries(overrides)) {
    const landmarkIndex = Number(index);
    landmarks[landmarkIndex] = {
      ...landmarks[landmarkIndex],
      ...patch,
    };
  }

  // Overlay requires a thumb+index pinch to emit a stroke. Default the thumb
  // (landmark 4) to sit right next to the (possibly overridden) index tip so
  // every fixture represents "pinched, stroke active." Callers who want to
  // test pen-up pass `4: { x: ..., y: ... }` explicitly.
  if (overrides[4] === undefined) {
    const tip = landmarks[8];
    landmarks[4] = { x: tip.x + 0.01, y: tip.y + 0.01, z: 0, visibility: 0.95 };
  }

  return landmarks;
}

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

  it('records tracker load failures in the app-owned debug snapshot', async () => {
    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })) as unknown as () => Promise<MediaStream>
    );

    render(
      <AirBrushOverlay
        active
        createHandLandmarker={async () => {
          throw new Error('cdn blocked');
        }}
      />
    );

    expect(
      await screen.findByText(/finger tracking unavailable/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.__AETHER_AIR_BRUSH_DEBUG__).toMatchObject({
        lastStage: 'tracker-error',
        lastError: 'cdn blocked',
        trackingState: 'error',
      });
    });
    expect(
      window.__AETHER_AIR_BRUSH_DEBUG__?.events.some(
        (event) => event.stage === 'camera-ready'
      )
    ).toBe(true);
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

  it('uses the live pad as an app-owned pointer fallback when camera is unavailable', async () => {
    installMediaDevices(vi.fn(async () => {
      throw new Error('no camera');
    }) as unknown as () => Promise<MediaStream>);
    const onPoint = vi.fn();

    render(
      <AirBrushOverlay
        active
        onPoint={onPoint}
        createHandLandmarker={noFingerTracking}
      />
    );

    await screen.findByText(/camera unavailable/i);
    const pad = screen.getByLabelText(/air brush fallback pad/i);
    vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 400,
      height: 300,
      right: 500,
      bottom: 500,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });
    Object.defineProperty(pad, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(pad, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });

    fireEvent.pointerDown(pad, {
      clientX: 200,
      clientY: 260,
      pointerId: 9,
      pressure: 0.5,
    });
    fireEvent.pointerMove(pad, {
      clientX: 300,
      clientY: 320,
      pointerId: 9,
      pressure: 0.5,
    });
    fireEvent.pointerUp(pad, {
      clientX: 300,
      clientY: 320,
      pointerId: 9,
      pressure: 0.5,
    });

    expect(onPoint).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        state: 'start',
        source: 'pointer',
      })
    );
    expect(onPoint).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        state: 'move',
        source: 'pointer',
      })
    );
    expect(onPoint).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        state: 'end',
        source: 'pointer',
      })
    );
    expect(window.__AETHER_AIR_BRUSH_DEBUG__).toMatchObject({
      lastStage: 'pointer-fallback',
      emittedPointCount: 3,
    });
  });

  it('emits MediaPipe index-finger points when landmark tracking is ready', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockReturnValue(0.1);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    const landmarkContext = {
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      landmarkContext as unknown as CanvasRenderingContext2D
    );

    const stop = vi.fn();
    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop }],
      })) as unknown as () => Promise<MediaStream>
    );
    const onPoint = vi.fn();
    const detectForVideo = vi.fn(() => ({
      landmarks: [trackedHand()],
      handedness: [[{ score: 0.95, categoryName: 'Right' }]],
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

    expect(await screen.findByText(/show hand to camera/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/air brush hand landmarks/i)
    ).toBeInTheDocument();
    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));

    // Pen-down is debounced across PINCH_WARMUP_FRAMES (2) to avoid thumb-on-
    // index jitter leaving a dot at the stroke start. First tick must not emit.
    act(() => {
      rafCallbacks.shift()?.(100);
    });
    expect(onPoint).not.toHaveBeenCalled();

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    act(() => {
      rafCallbacks.shift()?.(116);
    });

    await waitFor(() => {
      expect(onPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0.75,
          y: 0.4,
          state: 'start',
          source: 'camera',
          intent: 'draw',
        })
      );
    });
    expect(landmarkContext.stroke).toHaveBeenCalled();
    expect(landmarkContext.arc).toHaveBeenCalled();
  });

  it('uses the left index finger as the erase stream when both hands are visible', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockReturnValue(0.1);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);

    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })) as unknown as () => Promise<MediaStream>
    );
    const onPoint = vi.fn();
    const detectForVideo = vi.fn(() => ({
      landmarks: [
        trackedHand({ 8: { x: 0.25, y: 0.4 } }),
        trackedHand({
          0: { x: 0.58, y: 0.82 },
          5: { x: 0.64, y: 0.62 },
          6: { x: 0.66, y: 0.54 },
          7: { x: 0.69, y: 0.48 },
          8: { x: 0.72, y: 0.42 },
          17: { x: 0.46, y: 0.68 },
        }),
      ],
      handedness: [
        [{ score: 0.95, categoryName: 'Right' }],
        [{ score: 0.96, categoryName: 'Left' }],
      ],
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

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    act(() => {
      rafCallbacks.shift()?.(100);
    });
    expect(onPoint).not.toHaveBeenCalled();

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));
    act(() => {
      rafCallbacks.shift()?.(116);
    });

    await waitFor(() => {
      expect(onPoint).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0.28,
          y: 0.42,
          state: 'start',
          source: 'camera',
          intent: 'erase',
        })
      );
    });
  });

  it('ignores open palm before any stroke has started', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockReturnValue(0.1);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
      } as unknown as CanvasRenderingContext2D
    );

    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })) as unknown as () => Promise<MediaStream>
    );

    const openPalm = buildOpenPalmHand();
    const detectForVideo = vi.fn(() => ({
      landmarks: [openPalm],
      handedness: [[{ score: 0.95, categoryName: 'Right' }]],
    }));
    const onEndAirBrush = vi.fn();

    render(
      <AirBrushOverlay
        active
        onEndAirBrush={onEndAirBrush}
        createHandLandmarker={async () => ({
          detectForVideo,
          close: vi.fn(),
        })}
      />
    );

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));

    // Hold the open palm for well past OPEN_PALM_HOLD_FRAMES. The gate should
    // still refuse to fire end_air_brush because no stroke has been drawn.
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        rafCallbacks.shift()?.(100 + i * 16);
      });
      if (rafCallbacks.length === 0) break;
    }

    expect(onEndAirBrush).not.toHaveBeenCalled();
  });

  it('fires onEndAirBrush after a stroke has started and an open palm is sustained', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockReturnValue(0.1);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {
        clearRect: vi.fn(),
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
      } as unknown as CanvasRenderingContext2D
    );

    installMediaDevices(
      vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })) as unknown as () => Promise<MediaStream>
    );

    const pinchedFrame = {
      landmarks: [trackedHand()],
      handedness: [[{ score: 0.95, categoryName: 'Right' }]],
    };
    const openPalm = buildOpenPalmHand();
    const openFrame = {
      landmarks: [openPalm],
      handedness: [[{ score: 0.95, categoryName: 'Right' }]],
    };

    // 3 pinched frames (warmup = 2, then at least one emitted start), then
    // switch to open palm.
    let frameIndex = 0;
    const detectForVideo = vi.fn(() => {
      frameIndex += 1;
      return frameIndex <= 3 ? pinchedFrame : openFrame;
    });
    const onEndAirBrush = vi.fn();

    render(
      <AirBrushOverlay
        active
        onEndAirBrush={onEndAirBrush}
        createHandLandmarker={async () => ({
          detectForVideo,
          close: vi.fn(),
        })}
      />
    );

    await waitFor(() => expect(rafCallbacks.length).toBeGreaterThan(0));

    for (let i = 0; i < 20; i += 1) {
      act(() => {
        rafCallbacks.shift()?.(100 + i * 16);
      });
      if (rafCallbacks.length === 0) break;
    }

    await waitFor(() => {
      expect(onEndAirBrush).toHaveBeenCalledTimes(1);
    });
  });
});

function buildOpenPalmHand() {
  const openPalm = Array.from({ length: 21 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
  }));
  openPalm[0] = { x: 0.5, y: 0.85, z: 0, visibility: 0.95 };
  openPalm[5] = { x: 0.44, y: 0.6, z: 0, visibility: 0.95 };
  openPalm[17] = { x: 0.62, y: 0.62, z: 0, visibility: 0.95 };
  openPalm[4] = { x: 0.32, y: 0.5, z: 0, visibility: 0.95 };
  openPalm[8] = { x: 0.42, y: 0.32, z: 0, visibility: 0.95 };
  openPalm[12] = { x: 0.52, y: 0.3, z: 0, visibility: 0.95 };
  openPalm[16] = { x: 0.6, y: 0.32, z: 0, visibility: 0.95 };
  openPalm[20] = { x: 0.68, y: 0.38, z: 0, visibility: 0.95 };
  return openPalm;
}
