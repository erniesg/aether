import fs from 'node:fs';
import path from 'node:path';
import {
  captureEventPostScreenshots,
  type CaptureEventPostScreenshotsInput,
} from '../lib/research/event-recap/post-capture';
import { isEventPlatform, type EventPlatform } from '../lib/research/event-recap/types';

function loadEnvLocal() {
  const file = path.resolve('.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(argv: string[]): CaptureEventPostScreenshotsInput {
  const input: CaptureEventPostScreenshotsInput = {
    eventId: 'ai-engineer-singapore',
    platforms: ['x', 'linkedin'],
    perPlatform: 2,
  };
  const urls: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--event' || arg === '--event-id') {
      input.eventId = requireValue(arg, next);
      index += 1;
    } else if (arg === '--platforms') {
      input.platforms = requireValue(arg, next)
        .split(',')
        .map((platform) => platform.trim())
        .filter((platform): platform is EventPlatform => isEventPlatform(platform))
        .filter((platform) => platform === 'x' || platform === 'linkedin');
      index += 1;
    } else if (arg === '--limit') {
      input.limit = numberValue(arg, next);
      input.perPlatform = undefined;
      index += 1;
    } else if (arg === '--all') {
      input.all = true;
      input.perPlatform = undefined;
      input.limit = undefined;
    } else if (arg === '--per-platform') {
      input.perPlatform = numberValue(arg, next);
      index += 1;
    } else if (arg === '--url') {
      urls.push(requireValue(arg, next));
      index += 1;
    } else if (arg === '--run-id') {
      input.runId = requireValue(arg, next);
      index += 1;
    } else if (arg === '--resume') {
      input.resume = true;
    } else if (arg === '--no-linkedin-comments' || arg === '--linkedin-post-only') {
      input.includeLinkedInComments = false;
    } else if (arg === '--headful') {
      input.headless = false;
    } else if (arg === '--headless') {
      input.headless = true;
    } else if (arg === '--timeout-ms') {
      input.timeoutMs = numberValue(arg, next);
      index += 1;
    } else if (arg === '--wait-after-load-ms') {
      input.waitAfterLoadMs = numberValue(arg, next);
      index += 1;
    } else if (arg === '--concurrency') {
      input.concurrency = numberValue(arg, next);
      index += 1;
    } else if (arg === '--storage-state') {
      input.storageStatePath = requireValue(arg, next);
      index += 1;
    } else if (arg === '--user-data-dir') {
      input.userDataDir = requireValue(arg, next);
      index += 1;
    } else if (arg === '--output-root') {
      input.outputRoot = requireValue(arg, next);
      index += 1;
    } else if (arg === '--include-irrelevant') {
      input.includeIrrelevant = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (urls.length) input.urls = urls;
  return input;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function numberValue(flag: string, value: string | undefined): number {
  const parsed = Number(requireValue(flag, value));
  if (!Number.isFinite(parsed)) throw new Error(`${flag} requires a finite number`);
  return parsed;
}

function usage() {
  console.log(
    [
      'Usage:',
      '  npx tsx scripts/event-recap-capture-posts.ts --event ai-engineer-singapore --per-platform 2',
      '',
      'Options:',
      '  --platforms x,linkedin',
      '  --all',
      '  --limit 6',
      '  --per-platform 2',
      '  --url https://x.com/...',
      '  --run-id linkedin-top100-post-only',
      '  --resume',
      '  --no-linkedin-comments',
      '  --concurrency 3',
      '  --storage-state path/to/state.json',
      '  --user-data-dir /tmp/aether-capture-profile',
      '  --headful',
    ].join('\n')
  );
}

async function main() {
  loadEnvLocal();
  const input = parseArgs(process.argv.slice(2));
  input.onProgress = ({ completed, total, capture }) => {
    const rel = capture.screenshotRelPath ?? capture.error ?? capture.blockedReason ?? 'no artifact';
    console.error(
      `[capture] ${completed}/${total} ${capture.platform} ${capture.status}${capture.resumed ? ' resumed' : ''} ${rel}`
    );
  };
  const run = await captureEventPostScreenshots(input);
  console.log(
    JSON.stringify(
      {
        eventId: run.eventId,
        runId: run.runId,
        targetCount: run.targetCount,
        capturedCount: run.capturedCount,
        resumedCount: run.resumedCount,
        pageCapturedCount: run.pageCapturedCount,
        blockedCount: run.blockedCount,
        failedCount: run.failedCount,
        manifestPath: run.manifestPath,
        captures: run.captures.map((capture) => ({
          platform: capture.platform,
          status: capture.status,
          url: capture.url,
          screenshotRelPath: capture.screenshotRelPath,
          blockedReason: capture.blockedReason,
          error: capture.error,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
