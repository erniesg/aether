import fs from 'node:fs';
import path from 'node:path';
import type { EventPostCapture, EventPostCaptureRun } from './post-capture';

export type EventCaptureExportFormat = 'json' | 'csv' | 'zip';

export function findEventCaptureRun(
  eventId: string,
  runId?: string | null
): EventPostCaptureRun | null {
  const root = eventCaptureRoot(eventId);
  const manifestPath = runId ? manifestPathForRun(root, runId) : latestManifestPath(root);
  if (!manifestPath) return null;
  if (!isInside(root, manifestPath) || !fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as EventPostCaptureRun;
}

export function eventCapturesCsv(run: EventPostCaptureRun): string {
  const header = [
    'eventId',
    'runId',
    'platform',
    'status',
    'url',
    'finalUrl',
    'postId',
    'authorName',
    'authorHandle',
    'capturedAt',
    'screenshotRelPath',
    'screenshotBytes',
    'screenshotSha256',
    'blockedReason',
    'warnings',
  ];
  const rows = run.captures.map((capture) => [
    capture.eventId,
    capture.runId,
    capture.platform,
    capture.status,
    capture.url,
    capture.finalUrl ?? '',
    capture.postId ?? '',
    capture.authorName ?? '',
    capture.authorHandle ?? '',
    String(capture.capturedAt),
    capture.screenshotRelPath ?? '',
    capture.screenshotBytes === undefined ? '' : String(capture.screenshotBytes),
    capture.screenshotSha256 ?? '',
    capture.blockedReason ?? '',
    capture.warnings.join('|'),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function captureByPostUrl(
  run: EventPostCaptureRun | null | undefined
): Map<string, EventPostCapture> {
  const byUrl = new Map<string, EventPostCapture>();
  for (const capture of run?.captures ?? []) {
    byUrl.set(postUrlKey(capture.url), capture);
  }
  return byUrl;
}

function eventCaptureRoot(eventId: string): string {
  return path.resolve(process.cwd(), 'outputs', `event-recap-${safeSegment(eventId)}`, 'captures');
}

function manifestPathForRun(root: string, runId: string): string | null {
  const safeRunId = safeSegment(runId);
  if (!safeRunId) return null;
  return path.resolve(root, safeRunId, 'manifest.json');
}

function latestManifestPath(root: string): string | null {
  if (!fs.existsSync(root)) return null;
  const candidates = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'manifest.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => {
      const stat = fs.statSync(file);
      const manifest = readManifestSummary(file);
      return {
        file,
        mtime: stat.mtimeMs,
        targetCount: manifest?.targetCount ?? 0,
        finishedAt: manifest?.finishedAt ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.targetCount - a.targetCount ||
        b.finishedAt - a.finishedAt ||
        b.mtime - a.mtime
    );
  return candidates[0]?.file ?? null;
}

function readManifestSummary(file: string): Pick<EventPostCaptureRun, 'targetCount' | 'finishedAt'> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<EventPostCaptureRun>;
    return {
      targetCount: typeof parsed.targetCount === 'number' ? parsed.targetCount : 0,
      finishedAt: typeof parsed.finishedAt === 'number' ? parsed.finishedAt : 0,
    };
  } catch {
    return null;
  }
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function postUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
