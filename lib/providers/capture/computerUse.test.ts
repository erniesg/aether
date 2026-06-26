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
});
