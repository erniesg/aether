/**
 * Event recap → platform illustration plans (and optional hero renders).
 *
 * Dry-run by default: reads a public recap bundle, builds the per-platform
 * doodle/sketchnote illustration plan (lib/recap-illustration/plan.ts) and
 * prints it as JSON. With --generate it resolves an image provider through
 * the provider-agnostic registry and renders one hero per platform, saving
 * files next to the bundle under illustrations/.
 *
 * Usage:
 *   npx tsx scripts/event-recap-illustrations.ts
 *   npx tsx scripts/event-recap-illustrations.ts outputs/event-recap-ai-engineer-singapore/public.json
 *   npx tsx scripts/event-recap-illustrations.ts --platforms x,instagram --style editorial-flat
 *   npx tsx scripts/event-recap-illustrations.ts --generate [--provider openai] [--model <id>]
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildRecapIllustrationPlan,
  toRecapIllustrationBundle,
  RECAP_PLATFORMS,
  type IllustrationSpec,
  type RecapIllustrationOptions,
  type RecapIllustrationStyle,
  type RecapPlatform,
} from '../lib/recap-illustration/plan';
import { resolveProvider } from '../lib/providers/image/registry';

const DEFAULT_BUNDLE_PATH = 'outputs/event-recap-ai-engineer-singapore/public.json';

interface ScriptArgs {
  bundlePath: string;
  options: RecapIllustrationOptions;
  generate: boolean;
  provider?: string;
  model?: string;
  outDir?: string;
}

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

function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = {
    bundlePath: DEFAULT_BUNDLE_PATH,
    options: {},
    generate: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--platforms') {
      args.options.platforms = requireValue(arg, next)
        .split(',')
        .map((p) => p.trim())
        .filter((p): p is RecapPlatform =>
          (RECAP_PLATFORMS as readonly string[]).includes(p)
        );
      index += 1;
    } else if (arg === '--style') {
      const style = requireValue(arg, next);
      if (style !== 'doodle-sketchnote' && style !== 'editorial-flat') {
        throw new Error(`--style must be doodle-sketchnote or editorial-flat, got: ${style}`);
      }
      args.options.style = style as RecapIllustrationStyle;
      index += 1;
    } else if (arg === '--generate') {
      args.generate = true;
    } else if (arg === '--dry-run') {
      args.generate = false;
    } else if (arg === '--provider') {
      args.provider = requireValue(arg, next);
      index += 1;
    } else if (arg === '--model') {
      args.model = requireValue(arg, next);
      index += 1;
    } else if (arg === '--out-dir') {
      args.outDir = requireValue(arg, next);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      args.bundlePath = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function usage() {
  console.log(
    [
      'Usage:',
      '  npx tsx scripts/event-recap-illustrations.ts [bundle.json] [options]',
      '',
      'Options:',
      '  --platforms x,linkedin,instagram   subset of platforms to plan',
      '  --style doodle-sketchnote|editorial-flat',
      '  --generate                         render one hero per platform via the provider registry',
      '  --provider <id>                    preferred image provider id (registry precedence applies)',
      '  --model <id>                       model hint forwarded to the registry / provider',
      '  --out-dir <dir>                    where to save renders (default: <bundle dir>/illustrations)',
      '',
      `Default bundle: ${DEFAULT_BUNDLE_PATH}`,
    ].join('\n')
  );
}

function extensionForMime(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/webp/i.test(mimeType)) return 'webp';
  return 'png';
}

async function imageBytes(image: {
  url: string;
  dataUrl?: string;
}): Promise<Buffer> {
  const source = image.dataUrl ?? image.url;
  if (source.startsWith('data:')) {
    const comma = source.indexOf(',');
    if (comma === -1) throw new Error('malformed data URL from provider');
    return Buffer.from(source.slice(comma + 1), 'base64');
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`failed to download provider image: ${response.status} ${source}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function generateHeroes(args: ScriptArgs, specs: IllustrationSpec[], bundleDir: string) {
  const provider = resolveProvider(args.provider, args.model);
  const model = args.model ?? provider.listModels()[0];
  const outDir = path.resolve(args.outDir ?? path.join(bundleDir, 'illustrations'));
  fs.mkdirSync(outDir, { recursive: true });
  console.error(`[illustrations] provider=${provider.id} model=${model} outDir=${outDir}`);

  const saved: Array<{ platform: RecapPlatform; file: string; width: number; height: number }> = [];
  for (const spec of specs) {
    console.error(`[illustrations] generating ${spec.platform} hero (${spec.heroAspect})...`);
    const result = await provider.generate(
      { prompt: spec.prompt, aspectRatio: spec.heroAspect, n: 1 },
      { model }
    );
    const image = result.images[0];
    if (!image) {
      console.error(`[illustrations] ${spec.platform}: provider returned no image, skipping`);
      continue;
    }
    const file = path.join(
      outDir,
      `${spec.platform}-hero-${spec.heroFormat.id}.${extensionForMime(image.mimeType)}`
    );
    fs.writeFileSync(file, await imageBytes(image));
    saved.push({ platform: spec.platform, file, width: image.width, height: image.height });
    console.error(
      `[illustrations] saved ${spec.platform} hero ${image.width}x${image.height} in ${result.latencyMs}ms → ${file}`
    );
  }

  const manifestPath = path.join(outDir, 'illustration-plan.json');
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ provider: provider.id, model, specs, saved }, null, 2)}\n`
  );
  console.error(`[illustrations] manifest → ${manifestPath}`);
  return { saved, manifestPath };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const bundlePath = path.resolve(args.bundlePath);
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`bundle not found: ${bundlePath}`);
  }
  const raw: unknown = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const bundle = toRecapIllustrationBundle(raw);
  const specs = buildRecapIllustrationPlan(bundle, args.options);

  if (!args.generate) {
    console.log(JSON.stringify({ bundle: { eventId: bundle.eventId, eventName: bundle.eventName }, specs }, null, 2));
    return;
  }

  const { saved } = await generateHeroes(args, specs, path.dirname(bundlePath));
  console.log(JSON.stringify({ saved: saved.map((s) => s.file) }, null, 2));
}

main().catch((error) => {
  console.error(`[illustrations] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
