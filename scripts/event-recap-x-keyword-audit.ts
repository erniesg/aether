import fs from 'node:fs';
import path from 'node:path';
import { countXRecentQueries } from '../lib/research/event-recap/x-api';

const ARCHIVE_PATH = 'outputs/event-recap-ai-engineer-singapore/archive.json';

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

function numberEnv(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.round(raw)));
}

async function main() {
  loadEnvLocal();
  const archive = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8')) as Record<string, any>;
  const candidates = [
    '@aiDotEngineer',
    'from:aiDotEngineer',
    '@aiDotEngineer Singapore',
    '@aiDotEngineer AIE',
    '@aiDotEngineer keynote',
    '@aiDotEngineer workshop',
    '@aiDotEngineer hackathon',
    'AI Engineer Singapore',
    '"AI Engineer Singapore"',
    '"AI Engineer" Singapore conference',
    '"AI Engineer" Singapore summit',
    '"AI Engineer" Singapore workshop',
    '"AI Engineer" Singapore hackathon',
    'AIE Singapore',
    'AIE SG',
    '"AIE" Singapore',
    'AI Engineer SG',
    'ai.engineer/singapore',
    '65labs Singapore',
    '65labs AIE',
    '65labs AI Engineer',
    '@SherryYanJiang AIE',
    '@SherryYanJiang Singapore',
    '@swyx AIE',
    '@swyx Singapore',
    '@agrimsingh AIE',
    'Agrim Singh AI Engineer',
    '@VivianBala AI Engineer',
    '@VivianBala personal agent',
    'VivianBala second brain',
    '"you cannot govern a technology"',
    'NanoClaw Singapore',
    'Gavriel_Cohen Singapore',
    'Gavriel Cohen AI Engineer',
    'OpenAI Codex Singapore',
    'Codex Technical Workshop Singapore',
    'Cursor AI Engineer Singapore',
    'LlamaIndex AI Engineer Singapore',
    'Google DeepMind AI Engineer Singapore',
    'Vercel AI Engineer Singapore',
    'Cloudflare AI Engineer Singapore',
    'Capitol Theatre AI Engineer',
    'Capitol Kempinski AI Engineer',
    'Pullman Singapore AI Engineer',
  ];
  const result = await countXRecentQueries({
    querySet: candidates,
    windowStart: archive.windowStart,
    windowEnd: archive.windowEnd,
    maxQueries: numberEnv('EVENT_RECAP_X_KEYWORD_AUDIT_MAX_QUERIES', candidates.length, 1, candidates.length),
  });
  const output = {
    generatedAt: new Date().toISOString(),
    mode: 'x-keyword-count-audit',
    warnings: result.warnings,
    windowStart: result.windowStart,
    windowEnd: result.windowEnd,
    totalLowerBound: result.totalLowerBound,
    estimates: result.estimates.sort((a, b) => (b.count ?? -1) - (a.count ?? -1)),
  };
  const outPath = `outputs/event-recap-ai-engineer-singapore/x-keyword-audit-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ outPath, top: output.estimates.slice(0, 20) }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
