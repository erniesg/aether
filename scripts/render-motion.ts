/**
 * Scaffold a renderable HyperFrames project from a MotionBrief.
 *
 * Usage:
 *   npx tsx scripts/render-motion.ts --brief path/to/brief.json
 *   npx tsx scripts/render-motion.ts --recap outputs/event-recap-<slug>/public.json --event "AI Engineer 2026"
 *
 * Writes outputs/motion/<brief-id>/ with index.html + package.json +
 * hyperframes.json, then prints the render command. Rendering itself stays
 * with the HyperFrames CLI so this script has no heavy dependencies.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { briefFromRecap, type MotionBrief } from '../lib/motion/brief';
import { compileQuoteCascade } from '../lib/motion/compile';

interface CliArgs {
  brief?: string;
  recap?: string;
  event?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--brief') args.brief = value;
    if (key === '--recap') args.recap = value;
    if (key === '--event') args.event = value;
    if (key === '--out') args.out = value;
  }
  return args;
}

function loadBrief(args: CliArgs): MotionBrief {
  if (args.brief) {
    return JSON.parse(readFileSync(args.brief, 'utf8')) as MotionBrief;
  }
  if (args.recap) {
    const bundle = JSON.parse(readFileSync(args.recap, 'utf8')) as {
      event?: { name?: string };
      themes?: never[];
      posts?: never[];
    };
    return briefFromRecap({
      eventName: args.event ?? bundle.event?.name ?? 'event',
      themes: bundle.themes ?? [],
      posts: bundle.posts ?? [],
    });
  }
  throw new Error('pass --brief <file.json> or --recap <public.json> [--event <name>]');
}

const args = parseArgs(process.argv.slice(2));
const brief = loadBrief(args);
if (brief.quotes.length === 0) {
  throw new Error('brief produced no quotes — nothing to render');
}

const { html, durationSeconds } = compileQuoteCascade(brief);
const outDir = args.out ?? join('outputs', 'motion', brief.id);
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(
  join(outDir, 'package.json'),
  JSON.stringify(
    {
      name: brief.id,
      private: true,
      type: 'module',
      scripts: {
        dev: 'npx --yes hyperframes@0.6.52 preview',
        check:
          'npx --yes hyperframes@0.6.52 lint && npx --yes hyperframes@0.6.52 validate && npx --yes hyperframes@0.6.52 inspect',
        render: 'npx --yes hyperframes@0.6.52 render',
      },
    },
    null,
    2
  )
);
writeFileSync(
  join(outDir, 'hyperframes.json'),
  JSON.stringify(
    {
      $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
      registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
      paths: {
        blocks: 'compositions',
        components: 'compositions/components',
        assets: 'assets',
      },
    },
    null,
    2
  )
);

console.log(`motion project written: ${outDir}`);
console.log(`  scenes: ${brief.quotes.length} · duration: ${durationSeconds}s · 1080x1920`);
console.log(`  preview: cd ${outDir} && npm run dev`);
console.log(`  render:  cd ${outDir} && npm run render`);
