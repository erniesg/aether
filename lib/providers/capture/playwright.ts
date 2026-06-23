import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createBrowserCaptureProvider,
  type BrowserCaptureRunner,
  type BrowserCaptureRunnerArtifact,
} from './browser';
import type { CaptureProvider } from './types';
import type {
  CaptureAppLaunch,
  CaptureCursorTarget,
  CaptureMode,
  CaptureRequest,
  CaptureStep,
} from './types';
import type { MotionProvenanceRef } from '@/lib/motion/project';

export interface PlaywrightCaptureSession {
  page: PlaywrightCapturePage;
  close(): Promise<void>;
}

export interface PlaywrightCaptureAppSession {
  close(): Promise<void>;
}

export type PlaywrightCaptureAppLauncher = (
  appLaunch: CaptureAppLaunch,
  request: CaptureRequest,
  options: CreatePlaywrightCaptureRunnerOptions
) => Promise<PlaywrightCaptureAppSession | void>;

export interface PlaywrightCapturePage {
  goto?(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForLoadState?(state: string, options?: { timeout?: number }): Promise<unknown>;
  waitForTimeout?(ms: number): Promise<unknown>;
  click?(selector: string): Promise<unknown>;
  fill?(selector: string, value: string): Promise<unknown>;
  type?(selector: string, value: string): Promise<unknown>;
  screenshot?(options: { path: string; fullPage?: boolean }): Promise<unknown>;
  content?(): Promise<string>;
  url?(): string;
  close?(): Promise<unknown>;
  video?(): { path(): Promise<string> } | null;
  mouse?: {
    click?(x: number, y: number): Promise<unknown>;
    wheel?(x: number, y: number): Promise<unknown>;
  };
  keyboard?: {
    type?(value: string): Promise<unknown>;
  };
}

export interface CreatePlaywrightCaptureRunnerOptions {
  outputDir: string;
  available?: boolean;
  headless?: boolean;
  timeoutMs?: number;
  openPage?: (
    request: CaptureRequest,
    options: CreatePlaywrightCaptureRunnerOptions
  ) => Promise<PlaywrightCaptureSession>;
  launchApp?: PlaywrightCaptureAppLauncher;
}

const RUNNER_PROVENANCE = {
  kind: 'provider',
  ref: 'playwright-browser-runner',
} satisfies MotionProvenanceRef;

export function createPlaywrightCaptureRunner(
  options: CreatePlaywrightCaptureRunnerOptions
): BrowserCaptureRunner {
  return {
    available: () => options.available ?? true,
    capture: async (request) => {
      mkdirSync(options.outputDir, { recursive: true });

      const openPage = options.openPage ?? openDefaultPlaywrightPage;
      const appSession = request.appLaunch
        ? await options.launchApp?.(request.appLaunch, request, options)
        : undefined;
      let session: PlaywrightCaptureSession | undefined;
      let closed = false;

      try {
        session = await openPage(request, options);
        await runSteps(session.page, request, options);

        if (request.mode === 'screen-recording') {
          const artifact = await finishScreenRecording(session.page, request);
          await session.close();
          closed = true;
          return [artifact];
        }

        if (request.mode === 'screenshot') {
          return [await captureScreenshot(session.page, request, options.outputDir)];
        }

        if (request.mode === 'dom-snapshot') {
          return [await captureDomSnapshot(session.page, request, options.outputDir)];
        }

        return [captureInteractionTrace(session.page, request, options.outputDir)];
      } finally {
        if (session && !closed) await session.close();
        await appSession?.close();
      }
    },
  };
}

export function createPlaywrightBrowserCaptureProvider(
  options: CreatePlaywrightCaptureRunnerOptions
): CaptureProvider {
  return createBrowserCaptureProvider({
    runner: createPlaywrightCaptureRunner(options),
  });
}

async function openDefaultPlaywrightPage(
  request: CaptureRequest,
  options: CreatePlaywrightCaptureRunnerOptions
): Promise<PlaywrightCaptureSession> {
  const packageName = '@playwright/test';
  const { chromium } = await import(packageName);
  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext({
    viewport: { width: request.viewport.width, height: request.viewport.height },
    deviceScaleFactor: request.viewport.deviceScaleFactor,
    ...(request.mode === 'screen-recording'
      ? {
          recordVideo: {
            dir: options.outputDir,
            size: { width: request.viewport.width, height: request.viewport.height },
          },
        }
      : {}),
  });
  const page = await context.newPage();

  return {
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

async function runSteps(
  page: PlaywrightCapturePage,
  request: CaptureRequest,
  options: CreatePlaywrightCaptureRunnerOptions
): Promise<void> {
  for (const step of request.steps) {
    await runStep(page, request, step, options);
  }
}

async function runStep(
  page: PlaywrightCapturePage,
  request: CaptureRequest,
  step: CaptureStep,
  options: CreatePlaywrightCaptureRunnerOptions
): Promise<void> {
  if (step.action === 'goto') {
    await page.goto?.(step.value ?? request.target.ref, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs ?? 30000,
    });
    return;
  }

  if (step.action === 'wait') {
    await waitForStep(page, step, options);
    return;
  }

  if (step.action === 'click') {
    if (step.selector && page.click) {
      await page.click(step.selector);
    } else if (step.targetPoint) {
      await page.mouse?.click?.(step.targetPoint.x, step.targetPoint.y);
    }
    return;
  }

  if (step.action === 'type') {
    if (step.selector && page.fill) {
      await page.fill(step.selector, step.value ?? '');
    } else if (step.selector && page.type) {
      await page.type(step.selector, step.value ?? '');
    } else if (step.value) {
      await page.keyboard?.type?.(step.value);
    }
    return;
  }

  if (step.action === 'scroll') {
    await page.mouse?.wheel?.(0, numericValue(step.value) ?? request.viewport.height);
    return;
  }

  if (step.action === 'record') {
    const waitMs = numericValue(step.value);
    if (waitMs) await page.waitForTimeout?.(waitMs);
  }
}

async function waitForStep(
  page: PlaywrightCapturePage,
  step: CaptureStep,
  options: CreatePlaywrightCaptureRunnerOptions
): Promise<void> {
  const value = step.value?.trim();
  if (value === 'network-idle' || value === 'networkidle') {
    await page.waitForLoadState?.('networkidle', { timeout: options.timeoutMs ?? 30000 });
    return;
  }
  if (value === 'domcontentloaded' || value === 'load') {
    await page.waitForLoadState?.(value, { timeout: options.timeoutMs ?? 30000 });
    return;
  }

  await page.waitForTimeout?.(numericValue(value) ?? 1000);
}

async function captureScreenshot(
  page: PlaywrightCapturePage,
  request: CaptureRequest,
  outputDir: string
): Promise<BrowserCaptureRunnerArtifact> {
  const filePath = outputPath(outputDir, request, 'png');
  if (!page.screenshot) throw new Error('Playwright page does not support screenshots');

  await page.screenshot({ path: filePath, fullPage: false });

  return {
    assetUrl: pathToFileURL(filePath).href,
    width: request.viewport.width,
    height: request.viewport.height,
    mimeType: 'image/png',
    cursorTargets: cursorTargetsFromSteps(request),
    provenance: [RUNNER_PROVENANCE],
  };
}

async function captureDomSnapshot(
  page: PlaywrightCapturePage,
  request: CaptureRequest,
  outputDir: string
): Promise<BrowserCaptureRunnerArtifact> {
  const filePath = outputPath(outputDir, request, 'json');
  const html = await (page.content?.() ?? Promise.resolve(''));

  writeJson(filePath, {
    url: page.url?.() ?? request.target.ref,
    html,
    viewport: request.viewport,
    appLaunch: request.appLaunch,
  });

  return {
    assetUrl: pathToFileURL(filePath).href,
    width: request.viewport.width,
    height: request.viewport.height,
    mimeType: 'application/json',
    cursorTargets: cursorTargetsFromSteps(request),
    provenance: [RUNNER_PROVENANCE],
  };
}

function captureInteractionTrace(
  page: PlaywrightCapturePage,
  request: CaptureRequest,
  outputDir: string
): BrowserCaptureRunnerArtifact {
  const filePath = outputPath(outputDir, request, 'json');
  writeJson(filePath, {
    url: page.url?.() ?? request.target.ref,
    viewport: request.viewport,
    steps: request.steps,
    cursorTargets: cursorTargetsFromSteps(request),
    appLaunch: request.appLaunch,
  });

  return {
    assetUrl: pathToFileURL(filePath).href,
    width: request.viewport.width,
    height: request.viewport.height,
    mimeType: 'application/json',
    cursorTargets: cursorTargetsFromSteps(request),
    provenance: [RUNNER_PROVENANCE],
  };
}

async function finishScreenRecording(
  page: PlaywrightCapturePage,
  request: CaptureRequest
): Promise<BrowserCaptureRunnerArtifact> {
  const video = page.video?.();
  await page.close?.();
  const videoPath = await video?.path();
  if (!videoPath) throw new Error('Playwright screen recording did not produce a video path');

  return {
    assetUrl: pathToFileURL(videoPath).href,
    width: request.viewport.width,
    height: request.viewport.height,
    mimeType: mimeTypeForVideoPath(videoPath),
    cursorTargets: cursorTargetsFromSteps(request),
    provenance: [RUNNER_PROVENANCE],
  };
}

function outputPath(outputDir: string, request: CaptureRequest, extension: string): string {
  return path.join(
    outputDir,
    `capture-${request.mode}-${slugFromRef(request.target.ref)}.${extension}`
  );
}

function writeJson(filePath: string, payload: unknown): void {
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function numericValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugFromRef(ref: string): string {
  return ref
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function cursorTargetsFromSteps(request: CaptureRequest): CaptureCursorTarget[] {
  return request.steps.flatMap((step) => {
    if (!step.targetPoint) return [];

    return [{ stepId: step.id, ...step.targetPoint }];
  });
}

function mimeTypeForVideoPath(filePath: string): string {
  return filePath.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'video/webm';
}
