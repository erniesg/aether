import path from 'node:path';
import type { MotionProject } from './project';
import { createLocalAppLauncher } from '@/lib/providers/capture/local-app-launch';
import { createPlaywrightBrowserCaptureProvider } from '@/lib/providers/capture/playwright';
import { listCaptureProviders } from '@/lib/providers/capture/registry';
import type { CaptureProvider } from '@/lib/providers/capture/types';

export interface MotionCaptureRunnerSummary {
  kind: 'playwright-local';
  providerId: string;
  outputDir: string;
  launchLocalApp: boolean;
  headless: boolean;
  timeoutMs?: number;
}

export interface InlineMotionCaptureRunner {
  provider: CaptureProvider;
  summary: MotionCaptureRunnerSummary;
}

export function buildInlineMotionCaptureRunner(
  value: unknown,
  project: MotionProject
): InlineMotionCaptureRunner | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('captureRunner must be a JSON object');

  const kind = stringValue(value.kind);
  if (kind !== 'playwright-local') {
    throw new Error('captureRunner.kind must be playwright-local');
  }

  const timeoutMs = optionalPositiveNumber(value.timeoutMs, 'captureRunner.timeoutMs');
  const headless = booleanValue(value.headless) ?? true;
  const launchLocalApp = booleanValue(value.launchLocalApp) ?? false;
  const outputDir = resolveCaptureOutputDir(project, value.outputDir);
  const provider = createPlaywrightBrowserCaptureProvider({
    outputDir,
    headless,
    timeoutMs,
    launchApp: launchLocalApp ? createLocalAppLauncher() : undefined,
  });

  return {
    provider,
    summary: {
      kind,
      providerId: provider.id,
      outputDir,
      launchLocalApp,
      headless,
      ...(timeoutMs ? { timeoutMs } : {}),
    },
  };
}

export function captureProviderInventory(inlineProvider?: CaptureProvider): Array<{
  id: string;
  displayName: string;
  available: boolean;
}> {
  const providers = listCaptureProviders();
  if (!inlineProvider) return providers;

  const inlineSummary = {
    id: inlineProvider.id,
    displayName: inlineProvider.displayName,
    available: inlineProvider.available(),
  };

  return [inlineSummary, ...providers.filter((provider) => provider.id !== inlineProvider.id)];
}

function resolveCaptureOutputDir(project: MotionProject, value: unknown): string {
  const requested = stringValue(value);
  const root = process.cwd();

  if (!requested) {
    return path.join(root, 'outputs', 'motion-captures', slugify(project.id));
  }

  if (path.isAbsolute(requested)) {
    throw new Error('captureRunner.outputDir must be relative to the aether workspace');
  }

  const resolved = path.resolve(root, requested);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('captureRunner.outputDir must stay inside the aether workspace');
  }

  return resolved;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = numericValue(value);
  if (!parsed || parsed <= 0) throw new Error(`${label} must be a positive number`);
  return parsed;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function slugify(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}
