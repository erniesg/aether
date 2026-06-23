import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createPlaywrightBrowserCaptureProvider,
  createPlaywrightCaptureRunner,
} from './playwright';
import type { CaptureRequest } from './types';

function request(mode: CaptureRequest['mode']): CaptureRequest {
  return {
    target: { kind: 'url', ref: 'https://paillette.app/search' },
    mode,
    aspectRatio: '9:16',
    viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
    steps: [
      {
        id: 'goto-source',
        label: 'Open source',
        action: 'goto',
        value: 'https://paillette.app/search',
      },
      {
        id: 'settle-source',
        label: 'Wait for app state',
        action: 'wait',
        value: 'network-idle',
      },
      {
        id: 'click-search',
        label: 'Click search',
        action: 'click',
        targetPoint: { x: 540, y: 960 },
      },
    ],
  };
}

function localAppRequest(mode: CaptureRequest['mode']): CaptureRequest {
  return {
    ...request(mode),
    target: { kind: 'local-app', ref: 'http://localhost:3000/' },
    steps: [
      {
        id: 'start-source',
        label: 'Start app',
        action: 'manual',
        value: 'npm run dev',
      },
      {
        id: 'goto-source',
        label: 'Open source',
        action: 'goto',
        value: 'http://localhost:3000/',
      },
      {
        id: 'settle-source',
        label: 'Wait for app state',
        action: 'wait',
        value: 'network-idle',
      },
    ],
    appLaunch: {
      command: 'npm run dev',
      cwd: '/Users/erniesg/code/erniesg/tong',
      targetUrl: 'http://localhost:3000/',
      readiness: {
        kind: 'http',
        url: 'http://localhost:3000/',
        timeoutMs: 60000,
      },
    },
  };
}

function createFakePage(videoPath?: string) {
  const calls: string[] = [];
  return {
    calls,
    page: {
      mouse: {
        click: vi.fn(async (x: number, y: number) => calls.push(`mouse.click:${x},${y}`)),
        wheel: vi.fn(async (_x: number, y: number) => calls.push(`mouse.wheel:${y}`)),
      },
      goto: vi.fn(async (url: string) => calls.push(`goto:${url}`)),
      waitForLoadState: vi.fn(async (state: string) => calls.push(`waitForLoadState:${state}`)),
      waitForTimeout: vi.fn(async (ms: number) => calls.push(`waitForTimeout:${ms}`)),
      screenshot: vi.fn(async ({ path: filePath }: { path: string }) =>
        calls.push(`screenshot:${path.basename(filePath)}`)
      ),
      content: vi.fn(async () => '<main><h1>Paillette Search</h1></main>'),
      url: vi.fn(() => 'https://paillette.app/search?q=ngs'),
      close: vi.fn(async () => calls.push('page.close')),
      video: vi.fn(() =>
        videoPath
          ? {
              path: async () => videoPath,
            }
          : null
      ),
    },
  };
}

describe('createPlaywrightCaptureRunner', () => {
  it('runs browser steps and returns a screenshot artifact receipt', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'aether-capture-'));
    const fake = createFakePage();
    const close = vi.fn(async () => {
      fake.calls.push('session.close');
    });
    const runner = createPlaywrightCaptureRunner({
      outputDir,
      openPage: async () => ({ page: fake.page, close }),
    });

    const [artifact] = await runner.capture(request('screenshot'));

    expect(runner.available()).toBe(true);
    expect(fake.calls).toEqual([
      'goto:https://paillette.app/search',
      'waitForLoadState:networkidle',
      'mouse.click:540,960',
      'screenshot:capture-screenshot-paillette-app-search.png',
      'session.close',
    ]);
    expect(artifact).toMatchObject({
      assetUrl: expect.stringContaining('capture-screenshot-paillette-app-search.png'),
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
      cursorTargets: [{ stepId: 'click-search', x: 540, y: 960 }],
      provenance: [{ kind: 'provider', ref: 'playwright-browser-runner' }],
    });
  });

  it('runs injected local app launch before browser capture and cleans it up', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'aether-capture-'));
    const fake = createFakePage();
    const launchCalls: string[] = [];
    const runner = createPlaywrightCaptureRunner({
      outputDir,
      launchApp: async (appLaunch) => {
        launchCalls.push(`${appLaunch.command}:${appLaunch.cwd}:${appLaunch.targetUrl}`);
        return {
          close: async () => {
            launchCalls.push('app.close');
          },
        };
      },
      openPage: async () => ({
        page: fake.page,
        close: async () => {
          launchCalls.push('page.close');
        },
      }),
    });

    const [artifact] = await runner.capture(localAppRequest('screenshot'));

    expect(launchCalls).toEqual([
      'npm run dev:/Users/erniesg/code/erniesg/tong:http://localhost:3000/',
      'page.close',
      'app.close',
    ]);
    expect(fake.calls).toContain('goto:http://localhost:3000/');
    expect(artifact).toMatchObject({
      assetUrl: expect.stringContaining('capture-screenshot-localhost-3000.png'),
      mimeType: 'image/png',
    });
  });

  it('writes DOM snapshot and interaction trace receipts to disk', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'aether-capture-'));
    const fake = createFakePage();
    const runner = createPlaywrightCaptureRunner({
      outputDir,
      openPage: async () => ({ page: fake.page, close: async () => undefined }),
    });

    const [snapshot] = await runner.capture(request('dom-snapshot'));
    const [trace] = await runner.capture(request('interaction-trace'));

    const snapshotPayload = JSON.parse(readFileSync(fileURLToPath(snapshot.assetUrl), 'utf8'));
    const tracePayload = JSON.parse(readFileSync(fileURLToPath(trace.assetUrl), 'utf8'));

    expect(snapshot).toMatchObject({
      assetUrl: expect.stringContaining('capture-dom-snapshot-paillette-app-search.json'),
      mimeType: 'application/json',
    });
    expect(snapshotPayload).toMatchObject({
      url: 'https://paillette.app/search?q=ngs',
      html: '<main><h1>Paillette Search</h1></main>',
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
    });
    expect(trace).toMatchObject({
      assetUrl: expect.stringContaining('capture-interaction-trace-paillette-app-search.json'),
      mimeType: 'application/json',
      cursorTargets: [{ stepId: 'click-search', x: 540, y: 960 }],
    });
    expect(tracePayload.steps.map((step: { id: string }) => step.id)).toEqual([
      'goto-source',
      'settle-source',
      'click-search',
    ]);
  });

  it('returns an existing Playwright video path for screen recordings', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'aether-capture-'));
    const videoPath = path.join(outputDir, 'recording.webm');
    const fake = createFakePage(videoPath);
    const runner = createPlaywrightCaptureRunner({
      outputDir,
      openPage: async () => ({
        page: fake.page,
        close: async () => {
          fake.calls.push('session.close');
        },
      }),
    });

    const [artifact] = await runner.capture(request('screen-recording'));

    expect(fake.calls).toContain('page.close');
    expect(fake.calls).toContain('session.close');
    expect(artifact).toMatchObject({
      assetUrl: expect.stringContaining('recording.webm'),
      mimeType: 'video/webm',
      provenance: [{ kind: 'provider', ref: 'playwright-browser-runner' }],
    });
  });

  it('wraps the Playwright runner in the browser capture provider', async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'aether-capture-'));
    const fake = createFakePage();
    const provider = createPlaywrightBrowserCaptureProvider({
      outputDir,
      openPage: async () => ({ page: fake.page, close: async () => undefined }),
    });

    const result = await provider.capture(request('screenshot'));

    expect(provider).toMatchObject({
      id: 'browser-capture',
      displayName: 'Browser capture',
    });
    expect(result).toMatchObject({
      providerId: 'browser-capture',
      artifacts: [
        {
          id: 'capture-screenshot-paillette-app-search',
          kind: 'screenshot',
          assetUrl: expect.stringContaining('capture-screenshot-paillette-app-search.png'),
        },
      ],
    });
  });
});
