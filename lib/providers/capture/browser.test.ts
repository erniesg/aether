import { describe, expect, it, vi } from 'vitest';
import { createBrowserCaptureProvider } from './browser';
import type { CaptureRequest } from './types';

const screenshotRequest: CaptureRequest = {
  target: { kind: 'url', ref: 'https://paillette.app/search' },
  mode: 'screenshot',
  aspectRatio: '9:16',
  viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
  steps: [
    {
      id: 'goto-source',
      label: 'Open source',
      action: 'goto',
      value: 'https://paillette.app/search',
    },
    { id: 'settle-source', label: 'Wait for app state', action: 'wait', value: 'network-idle' },
    { id: 'click-search', label: 'Click search', action: 'click', targetPoint: { x: 540, y: 960 } },
  ],
};

describe('createBrowserCaptureProvider', () => {
  it('fails closed when no runner is configured', async () => {
    const provider = createBrowserCaptureProvider();

    expect(provider.available()).toBe(false);
    await expect(provider.capture(screenshotRequest)).rejects.toThrow(/requires a runner/);
  });

  it('executes screenshot requests and maps runner output to capture artifacts', async () => {
    const capture = vi.fn(async () => [
      {
        assetUrl: 'asset://capture/home.png',
        mimeType: 'image/png',
      },
    ]);
    const provider = createBrowserCaptureProvider({
      runner: { available: () => true, capture },
    });

    const result = await provider.capture(screenshotRequest);

    expect(provider).toMatchObject({
      id: 'browser-capture',
      displayName: 'Browser capture',
    });
    expect(capture).toHaveBeenCalledWith(screenshotRequest);
    expect(result).toMatchObject({
      providerId: 'browser-capture',
      provenance: [
        { kind: 'provider', ref: 'browser-capture' },
        { kind: 'site', ref: 'https://paillette.app/search' },
      ],
    });
    expect(result.artifacts).toEqual([
      {
        id: 'capture-screenshot-paillette-app-search',
        kind: 'screenshot',
        assetUrl: 'asset://capture/home.png',
        width: 1080,
        height: 1920,
        mimeType: 'image/png',
        viewport: screenshotRequest.viewport,
        cursorTargets: [{ stepId: 'click-search', x: 540, y: 960 }],
        provenance: [
          { kind: 'provider', ref: 'browser-capture' },
          { kind: 'site', ref: 'https://paillette.app/search' },
        ],
      },
    ]);
  });

  it('maps DOM snapshots and traces to typed artifacts without losing runner receipts', async () => {
    const domRequest: CaptureRequest = {
      ...screenshotRequest,
      mode: 'dom-snapshot',
    };
    const traceRequest: CaptureRequest = {
      ...screenshotRequest,
      mode: 'interaction-trace',
    };
    const provider = createBrowserCaptureProvider({
      runner: {
        available: () => true,
        capture: async (request) => [
          {
            assetUrl:
              request.mode === 'dom-snapshot'
                ? 'asset://capture/dom.json'
                : 'asset://capture/trace.json',
            width: 1,
            height: 1,
            mimeType: 'application/json',
            provenance: [{ kind: 'manual', ref: `${request.mode}:runner-receipt` }],
          },
        ],
      },
    });

    await expect(provider.capture(domRequest)).resolves.toMatchObject({
      artifacts: [
        {
          id: 'capture-dom-snapshot-paillette-app-search',
          kind: 'snapshot',
          assetUrl: 'asset://capture/dom.json',
          provenance: [
            { kind: 'provider', ref: 'browser-capture' },
            { kind: 'site', ref: 'https://paillette.app/search' },
            { kind: 'manual', ref: 'dom-snapshot:runner-receipt' },
          ],
        },
      ],
    });
    await expect(provider.capture(traceRequest)).resolves.toMatchObject({
      artifacts: [
        {
          id: 'capture-interaction-trace-paillette-app-search',
          kind: 'trace',
          assetUrl: 'asset://capture/trace.json',
        },
      ],
    });
  });
});
