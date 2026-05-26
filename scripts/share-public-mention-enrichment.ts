import fs from 'node:fs';
import path from 'node:path';
import { enrichPublicMentions } from '../lib/share/enrichment';

function loadEnvFile(file: string) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return;
  for (const raw of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

interface Args {
  canonicalUrls: string[];
  shortUrls: string[];
  platforms?: Array<'x' | 'linkedin'>;
  daysLookback?: number;
  maxItemsPerPlatform?: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { canonicalUrls: [], shortUrls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--canonical-url') {
      args.canonicalUrls.push(requireValue(arg, next));
      index += 1;
    } else if (arg === '--short-url') {
      args.shortUrls.push(requireValue(arg, next));
      index += 1;
    } else if (arg === '--event-id') {
      args.canonicalUrls.push(canonicalEventUrl(requireValue(arg, next)));
      index += 1;
    } else if (arg === '--platforms') {
      args.platforms = requireValue(arg, next)
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is 'x' | 'linkedin' => value === 'x' || value === 'linkedin');
      index += 1;
    } else if (arg === '--days-lookback') {
      args.daysLookback = numberValue(arg, next);
      index += 1;
    } else if (arg === '--max-items-per-platform') {
      args.maxItemsPerPlatform = numberValue(arg, next);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function canonicalEventUrl(eventId: string): string {
  const origin =
    process.env.NEXT_PUBLIC_AETHER_PUBLIC_ORIGIN ??
    (process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN}`
      : 'https://aether.berlayar.ai');
  return `${origin.replace(/\/$/, '')}/events/${eventId}`;
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
      '  npx tsx scripts/share-public-mention-enrichment.ts --canonical-url https://aether.berlayar.ai/events/ai-engineer-singapore --short-url https://s.berlayar.ai/tota',
      '',
      'Options:',
      '  --event-id <eventId>                  Adds https://$NEXT_PUBLIC_AETHER_PUBLIC_DOMAIN/events/<eventId>',
      '  --canonical-url <url>                Canonical recap/vibes URL to search for. Repeatable.',
      '  --short-url <url>                    Aether short URL to search for and resolve. Repeatable.',
      '  --platforms x,linkedin              Default: x,linkedin',
      '  --days-lookback <n>                  Default: 14',
      '  --max-items-per-platform <n>         Default: 50',
    ].join('\n')
  );
}

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.dev.vars');
  const args = parseArgs(process.argv.slice(2));
  const result = await enrichPublicMentions({
    canonicalUrls: args.canonicalUrls,
    shortUrls: args.shortUrls,
    platforms: args.platforms,
    daysLookback: args.daysLookback,
    maxItemsPerPlatform: args.maxItemsPerPlatform,
  });
  console.log(
    JSON.stringify(
      {
        queries: result.queries,
        platforms: result.searchedPlatforms,
        candidates: result.candidates,
        matched: result.matched,
        upserted: result.upserted,
        skipped: result.skipped,
        warnings: result.warnings,
        mentions: result.mentions.map((mention) => ({
          platform: mention.platform,
          externalUrl: mention.externalUrl,
          canonicalUrl: mention.canonicalUrl,
          matchedUrl: mention.matchedUrl,
          confidence: mention.confidence,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
