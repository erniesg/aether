/**
 * Event recap → multi-format motion project.
 *
 * Reads a public recap bundle, adapts it via toEventRecapMotionInput
 * (lib/motion/recapBundleAdapter.ts), builds the MotionProject with
 * buildEventRecapMotionProject (lib/motion/recapMotion.ts), writes it next
 * to the bundle under motion/recap-motion-project.json, and prints a
 * summary of beats, drafts, and platform export targets.
 *
 * The saved project is the editable source of truth: load it through the
 * motion workspace (canvas video editor / full-auto golden path) to render
 * per-platform MP4s, or hand it to POST /api/motion routes.
 *
 * Usage:
 *   npx tsx scripts/event-recap-video.ts
 *   npx tsx scripts/event-recap-video.ts outputs/event-recap-ai-engineer-singapore/public.json
 *   npx tsx scripts/event-recap-video.ts --max-themes 3 --max-quotes 2 [--out <dir>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { toEventRecapMotionInput } from '../lib/motion/recapBundleAdapter';
import {
  buildEventRecapMotionProject,
  DEFAULT_EVENT_RECAP_PLATFORM_TARGETS,
} from '../lib/motion/recapMotion';

const DEFAULT_BUNDLE_PATH = 'outputs/event-recap-ai-engineer-singapore/public.json';

interface ScriptArgs {
  bundlePath: string;
  maxThemes?: number;
  maxQuotes?: number;
  outDir?: string;
}

function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = { bundlePath: DEFAULT_BUNDLE_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--max-themes') {
      args.maxThemes = parsePositiveInt(arg, next);
      index += 1;
    } else if (arg === '--max-quotes') {
      args.maxQuotes = parsePositiveInt(arg, next);
      index += 1;
    } else if (arg === '--out') {
      args.outDir = requireValue(arg, next);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg} (see --help)`);
    } else {
      args.bundlePath = arg;
    }
  }
  return args;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  const parsed = Number.parseInt(requireValue(flag, value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function printHelp() {
  console.log(
    [
      'event-recap-video — build a multi-format MotionProject from a recap bundle',
      '',
      'Usage: npx tsx scripts/event-recap-video.ts [bundlePath] [flags]',
      '',
      'Flags:',
      '  --max-themes <n>   theme beats to include (default 3)',
      '  --max-quotes <n>   verbatim quotes to include (default 2)',
      '  --out <dir>        output directory (default <bundle dir>/motion)',
      '  --help             show this help',
    ].join('\n')
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundlePath = path.resolve(args.bundlePath);
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle not found: ${bundlePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(bundlePath, 'utf8')) as unknown;
  const createdAt = Date.now();
  const input = toEventRecapMotionInput(raw, {
    id: `motion-recap-${createdAt.toString(36)}`,
    workspaceId: 'workspace-event-recap',
    createdAt,
    maxThemes: args.maxThemes,
    maxQuotes: args.maxQuotes,
    materializeTimeline: true,
  });
  const project = buildEventRecapMotionProject(input);

  const outDir = path.resolve(args.outDir ?? path.join(path.dirname(bundlePath), 'motion'));
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'recap-motion-project.json');
  fs.writeFileSync(outPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

  console.log(`event: ${input.eventName} (${input.eventId})`);
  console.log(
    `stats: ${input.stats.postCount} posts, ${input.stats.viewCount} views across ${input.stats.platforms.join(', ')}`
  );
  console.log(`beats: ${project.story.map((beat) => beat.id).join(' → ')}`);
  console.log(`drafts: ${project.drafts.map((draft) => draft.id).join(', ')}`);
  const targets = input.platformTargets ?? DEFAULT_EVENT_RECAP_PLATFORM_TARGETS;
  console.log(
    `exports: ${targets.map((target) => `${target.platform} ${target.aspectRatio}`).join(', ')}`
  );
  console.log(`saved: ${outPath}`);
}

main();
