import { describe, expect, it, vi } from 'vitest';
import { createComputerUseCaptureProvider } from './computerUse';
import type { CaptureRequest } from './types';

const screenshotRequest: CaptureRequest = {
  target: { kind: 'desktop-app', ref: 'Simulator: Tong onboarding' },
  mode: 'screenshot',
  aspectRatio: '9:16',
  viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
  steps: [
    {
      id: 'focus-window',
      label: 'Focus approved window',
      action: 'manual',
      value: 'Simulator: Tong onboarding',
    },
  ],
};

const recordingRequest: CaptureRequest = {
  ...screenshotRequest,
  mode: 'screen-recording',
  steps: [
    ...screenshotRequest.steps,
    {
      id: 'record-flow',
      label: 'Record approved product flow',
      action: 'record',
    },
  ],
};

const traceRequest: CaptureRequest = {
  ...screenshotRequest,
  mode: 'interaction-trace',
  steps: [
    ...screenshotRequest.steps,
    {
      id: 'tap-start',
      label: 'Tap the first lesson',
      action: 'manual',
      targetPoint: { x: 540, y: 1440 },
    },
  ],
};

describe('createComputerUseCaptureProvider', () => {
  it('fails closed without a configured runner', async () => {
    const provider = createComputerUseCaptureProvider();

    expect(provider.available()).toBe(false);
    await expect(provider.capture(screenshotRequest)).rejects.toThrow(/requires a runner/);
  });

  it('requires creator approval and a redaction manifest before desktop capture', async () => {
    const capture = vi.fn(async () => []);

    await expect(
      createComputerUseCaptureProvider({
        runner: { available: () => true, capture },
        redactionManifest: {
          labels: ['tokens'],
          applied: true,
          receiptRef: 'redactions.json',
        },
      }).capture(screenshotRequest)
    ).rejects.toThrow(/creator approval/);

    await expect(
      createComputerUseCaptureProvider({
        runner: { available: () => true, capture },
        approved: true,
      }).capture(screenshotRequest)
    ).rejects.toThrow(/redaction manifest/);

    expect(capture).not.toHaveBeenCalled();
  });

  it('normalizes approved computer-use receipts with redaction provenance', async () => {
    const capture = vi.fn(async () => [
      {
        assetUrl: 'asset://capture/tong-simulator.png',
        width: 1080,
        height: 1920,
        mimeType: 'image/png',
        redactions: [
          {
            label: 'tokens',
            target: 'browser toolbar',
            action: 'mask' as const,
            applied: true,
          },
        ],
      },
    ]);
    const provider = createComputerUseCaptureProvider({
      runner: { available: () => true, capture },
      approved: true,
      redactionManifest: {
        labels: ['tokens'],
        applied: true,
        receiptRef: 'redactions.json',
      },
    });

    const result = await provider.capture(screenshotRequest);

    expect(provider).toMatchObject({
      id: 'computer-use-capture',
      displayName: 'Computer-use capture',
    });
    expect(capture).toHaveBeenCalledWith(screenshotRequest, {
      approved: true,
      redactionManifest: {
        labels: ['tokens'],
        applied: true,
        receiptRef: 'redactions.json',
      },
    });
    expect(result).toMatchObject({
      providerId: 'computer-use-capture',
      artifacts: [
        {
          id: 'capture-computer-use-screenshot-simulator-tong-onboarding',
          kind: 'screenshot',
          assetUrl: 'asset://capture/tong-simulator.png',
          redactions: [
            {
              label: 'tokens',
              target: 'browser toolbar',
              action: 'mask',
              applied: true,
            },
          ],
          provenance: [
            { kind: 'provider', ref: 'computer-use-capture' },
            { kind: 'manual', ref: 'Simulator: Tong onboarding' },
            { kind: 'manual', ref: 'redaction:redactions.json' },
          ],
        },
      ],
    });
  });

  it('rejects capture outside the approved target scope', async () => {
    const capture = vi.fn(async () => [
      {
        assetUrl: 'asset://capture/unknown-window.png',
      },
    ]);
    const provider = createComputerUseCaptureProvider({
      runner: { available: () => true, capture },
      approved: true,
      approvedTarget: { kind: 'desktop-app', ref: 'Simulator: Tong onboarding' },
      redactionManifest: {
        labels: ['tokens'],
        applied: true,
        receiptRef: 'redactions.json',
      },
    });

    await expect(
      provider.capture({
        ...screenshotRequest,
        target: { kind: 'desktop-app', ref: 'Unknown browser window' },
      })
    ).rejects.toThrow(/approved target scope/);
    expect(capture).not.toHaveBeenCalled();
  });

  it('accepts approved recording receipts with the recording artifact contract', async () => {
    const capture = vi.fn(async () => [
      {
        assetUrl: 'asset://capture/tong-flow.mp4',
        durationMs: 4200,
      },
    ]);
    const provider = createComputerUseCaptureProvider({
      runner: { available: () => true, capture },
      approved: true,
      approvedTarget: { kind: 'desktop-app', ref: 'Simulator: Tong onboarding' },
      redactionManifest: {
        labels: ['tokens'],
        applied: true,
        receiptRef: 'redactions.json',
      },
    });

    await expect(provider.capture(recordingRequest)).resolves.toMatchObject({
      providerId: 'computer-use-capture',
      artifacts: [
        {
          id: 'capture-computer-use-recording-simulator-tong-onboarding',
          kind: 'recording',
          assetUrl: 'asset://capture/tong-flow.mp4',
          durationMs: 4200,
          mimeType: 'video/mp4',
        },
      ],
    });
  });

  it('keeps trace receipts tied to redaction and runner provenance', async () => {
    const capture = vi.fn(async () => [
      {
        assetUrl: 'asset://capture/tong-trace.json',
        provenance: [{ kind: 'manual' as const, ref: 'trace:desktop-run-1' }],
      },
    ]);
    const provider = createComputerUseCaptureProvider({
      runner: { available: () => true, capture },
      approved: true,
      approvedTarget: { kind: 'desktop-app', ref: 'Simulator: Tong onboarding' },
      redactionManifest: {
        labels: ['tokens'],
        applied: true,
        receiptRef: 'redactions.json',
      },
    });

    const result = await provider.capture(traceRequest);

    expect(result.artifacts[0]).toMatchObject({
      id: 'capture-computer-use-trace-simulator-tong-onboarding',
      kind: 'trace',
      assetUrl: 'asset://capture/tong-trace.json',
      mimeType: 'application/json',
      cursorTargets: [{ stepId: 'tap-start', x: 540, y: 1440 }],
      provenance: [
        { kind: 'provider', ref: 'computer-use-capture' },
        { kind: 'manual', ref: 'Simulator: Tong onboarding' },
        { kind: 'manual', ref: 'redaction:redactions.json' },
        { kind: 'manual', ref: 'trace:desktop-run-1' },
      ],
    });
  });
});
