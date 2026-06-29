import path from 'node:path';
import type { MotionProject, MotionProvenanceRef } from './project';
import {
  createComputerUseCaptureProvider,
  type ComputerUseCaptureRunnerArtifact,
} from '@/lib/providers/capture/computerUse';
import { createLocalAppLauncher } from '@/lib/providers/capture/local-app-launch';
import { createPlaywrightBrowserCaptureProvider } from '@/lib/providers/capture/playwright';
import { listCaptureProviders } from '@/lib/providers/capture/registry';
import type {
  CaptureProvider,
  CaptureTarget,
  CaptureRedaction,
  CaptureRedactionAction,
  CaptureRedactionManifest,
} from '@/lib/providers/capture/types';

export type MotionCaptureRunnerSummary =
  | MotionPlaywrightCaptureRunnerSummary
  | MotionComputerUseCaptureRunnerSummary;

export interface MotionPlaywrightCaptureRunnerSummary {
  kind: 'playwright-local';
  providerId: string;
  outputDir: string;
  launchLocalApp: boolean;
  headless: boolean;
  timeoutMs?: number;
}

export interface MotionComputerUseCaptureRunnerSummary {
  kind: 'computer-use-local';
  providerId: string;
  approved: true;
  approvedTarget?: CaptureTarget;
  redactionLabels: string[];
  receiptCount: number;
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
  if (kind === 'computer-use-local') {
    return buildComputerUseInlineRunner(value);
  }
  if (kind !== 'playwright-local') {
    throw new Error('captureRunner.kind must be playwright-local or computer-use-local');
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

function buildComputerUseInlineRunner(
  value: Record<string, unknown>
): InlineMotionCaptureRunner {
  if (value.approved !== true) {
    throw new Error('computer-use capture requires creator approval');
  }

  const redactionManifest = parseRedactionManifest(value.redactionManifest);
  if (!redactionManifest?.applied) {
    throw new Error('computer-use capture requires an applied redaction manifest');
  }

  const approvedTarget = parseApprovedTarget(value.approvedTarget);
  const receipts = parseComputerUseReceipts(value.receipts);
  const provider = createComputerUseCaptureProvider({
    approved: true,
    ...(approvedTarget ? { approvedTarget } : {}),
    redactionManifest,
    runner: {
      available: () => true,
      capture: async () => receipts,
    },
  });

  return {
    provider,
    summary: {
      kind: 'computer-use-local',
      providerId: provider.id,
      approved: true,
      ...(approvedTarget ? { approvedTarget } : {}),
      redactionLabels: redactionManifest.labels,
      receiptCount: receipts.length,
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

function parseRedactionManifest(value: unknown): CaptureRedactionManifest | null {
  if (!isObject(value)) return null;
  const labels = parseStringArray(value.labels);
  const applied = booleanValue(value.applied);
  const receiptRef = stringValue(value.receiptRef);
  if (!labels || labels.length === 0 || applied !== true) return null;

  return {
    labels,
    applied: true,
    ...(receiptRef ? { receiptRef } : {}),
  };
}

function parseApprovedTarget(value: unknown): CaptureTarget | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error('computer-use approvedTarget must be a target object');

  const kind = stringValue(value.kind);
  const ref = stringValue(value.ref);
  if (!ref) throw new Error('computer-use approvedTarget.ref is required');
  if (kind !== 'url' && kind !== 'local-app' && kind !== 'desktop-app') {
    throw new Error('computer-use approvedTarget.kind must be url, local-app, or desktop-app');
  }

  return { kind, ref };
}

function parseComputerUseReceipts(value: unknown): ComputerUseCaptureRunnerArtifact[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('computer-use capture requires at least one receipt');
  }

  return value.map((receipt, index) => {
    if (!isObject(receipt)) throw new Error(`computer-use receipt ${index + 1} must be an object`);
    const assetUrl = stringValue(receipt.assetUrl);
    if (!assetUrl) throw new Error(`computer-use receipt ${index + 1} requires assetUrl`);
    const width = optionalPositiveNumber(receipt.width, `computer-use receipt ${index + 1}.width`);
    const height = optionalPositiveNumber(receipt.height, `computer-use receipt ${index + 1}.height`);
    const durationMs = optionalPositiveNumber(
      receipt.durationMs,
      `computer-use receipt ${index + 1}.durationMs`
    );
    const mimeType = stringValue(receipt.mimeType);
    const redactions = parseRedactions(receipt.redactions);
    const provenance = parseProvenanceRefs(receipt.provenance);

    return {
      assetUrl,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(durationMs ? { durationMs } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(redactions.length ? { redactions } : {}),
      ...(provenance.length ? { provenance } : {}),
    };
  });
}

function parseProvenanceRefs(value: unknown): MotionProvenanceRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('computer-use receipt provenance must be an array');

  return value.map((ref, index) => {
    if (!isObject(ref)) {
      throw new Error(`computer-use provenance ${index + 1} must be an object`);
    }
    const kind = stringValue(ref.kind);
    const targetRef = stringValue(ref.ref);
    if (!kind || !targetRef) {
      throw new Error(`computer-use provenance ${index + 1} is incomplete`);
    }

    return {
      kind: kind as MotionProvenanceRef['kind'],
      ref: targetRef,
    };
  });
}

function parseRedactions(value: unknown): CaptureRedaction[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('computer-use receipt redactions must be an array');

  return value.map((redaction, index) => {
    if (!isObject(redaction)) {
      throw new Error(`computer-use redaction ${index + 1} must be an object`);
    }
    const label = stringValue(redaction.label);
    const target = stringValue(redaction.target);
    const action = redactionAction(redaction.action);
    const applied = booleanValue(redaction.applied);
    if (!label || !target || !action || applied !== true) {
      throw new Error(`computer-use redaction ${index + 1} is incomplete`);
    }

    return {
      label,
      target,
      action,
      applied: true,
    };
  });
}

function redactionAction(value: unknown): CaptureRedactionAction | null {
  if (value === 'mask' || value === 'blur' || value === 'omit') return value;
  return null;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.flatMap((item) => {
    const next = stringValue(item);
    return next ? [next] : [];
  });
  return parsed.length === value.length ? parsed : null;
}

function slugify(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}
