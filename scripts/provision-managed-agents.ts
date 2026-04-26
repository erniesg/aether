/**
 * Programmatic provisioning of the three Aether Managed Agents.
 *
 * Creates (or updates) the research / signoff / cluster agents and a shared
 * environment via the Anthropic Managed Agents API, then writes the resulting
 * IDs into `.dev.vars` so the lap orchestrator picks them up on next run.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/provision-managed-agents.ts
 *
 * Idempotent: if env vars for an agent are already set in `.dev.vars`, this
 * script SKIPS recreation. Force a fresh provision with `--force`.
 *
 * Doc reference: https://docs.anthropic.com/en/docs/managed-agents/quickstart
 * Beta header: managed-agents-2026-04-01 (set automatically by SDK >= 0.90).
 */

import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEV_VARS_PATH = resolve(process.cwd(), '.dev.vars');
const FORCE = process.argv.includes('--force');

interface AgentSpec {
  /** Friendly name shown in the Anthropic Console. */
  name: string;
  /** Env var prefix — `RESEARCH` → `ANTHROPIC_RESEARCH_AGENT_ID` etc. */
  envPrefix: 'RESEARCH' | 'SIGNOFF' | 'CLUSTER';
  /** System prompt — drives the agent's role + output format. */
  system: string;
  /** Tools the agent can call. Empty = no tools (signoff/cluster). */
  tools: Array<{ type: string }>;
}

const RESEARCH_SYSTEM = [
  'You are the brand research agent for the Aether creative platform.',
  'Given a brand and its homepage URL, produce a Singapore-focused research bundle:',
  '- Top 3-5 competitors active in Singapore',
  '- Recent campaigns (last 6 months) — title + platform + url when available',
  '- Per-locale copy insights for en-SG, zh-Hans-SG, ms-SG, ta-SG (one sentence each)',
  '- Source URLs you cited',
  '',
  'Use web search to find specifics. Return ONLY the JSON object the user asks for; no preamble.',
].join('\n');

const SIGNOFF_SYSTEM = [
  'You are the brand signoff agent for a Singapore social media campaign.',
  'You receive: variations (caption + platform + schedule + mood + hasHero) and brand guardrails.',
  '',
  'For each variation, decide:',
  '  - "auto-post": meets all guardrails, schedule within 36h, has hero image.',
  '  - "hold-for-review": needs human eyes (borderline copy, missing schedule, etc.).',
  '  - "reject": violates guardrails or lacks a hero image.',
  '',
  'Return ONLY the JSON object the user asks for; no preamble.',
].join('\n');

const CLUSTER_SYSTEM = [
  'You are the visual clustering agent for a creative campaign.',
  'Given a list of reference image URLs, group them into 2-4 distinct visual clusters by similarity (mood, palette, composition, subject).',
  'For each cluster, return: a short label, a rationale, descriptive tags, and the 0-based indexes of member refs.',
  'List any refs that do not fit a cluster as `unclustered`.',
  '',
  'Return ONLY the JSON object the user asks for; no preamble.',
].join('\n');

const SPECS: AgentSpec[] = [
  {
    name: 'aether-research',
    envPrefix: 'RESEARCH',
    system: RESEARCH_SYSTEM,
    // agent_toolset_20260401 includes web_search + web_fetch; the bundled
    // toolset is the simplest way to give the research agent search.
    tools: [{ type: 'agent_toolset_20260401' }],
  },
  {
    name: 'aether-signoff',
    envPrefix: 'SIGNOFF',
    system: SIGNOFF_SYSTEM,
    tools: [], // pure JSON-out, no tools
  },
  {
    name: 'aether-cluster',
    envPrefix: 'CLUSTER',
    system: CLUSTER_SYSTEM,
    tools: [], // vision over URLs, no tools needed
  },
];

interface ProvisionResult {
  envPrefix: AgentSpec['envPrefix'];
  agentId: string;
  agentVersion: number;
  environmentId: string;
}

function readDevVars(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(DEV_VARS_PATH)) return map;
  const text = readFileSync(DEV_VARS_PATH, 'utf-8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return map;
}

function writeDevVars(updates: Record<string, string>): void {
  const lines = existsSync(DEV_VARS_PATH)
    ? readFileSync(DEV_VARS_PATH, 'utf-8').split(/\r?\n/)
    : [];
  const seen = new Set<string>();
  const replaced: string[] = [];

  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      if (key in updates) {
        replaced.push(`${key}=${updates[key]}`);
        seen.add(key);
        continue;
      }
    }
    replaced.push(line);
  }

  // Append any keys not already in the file.
  const tail: string[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) tail.push(`${k}=${v}`);
  }
  if (tail.length > 0) {
    if (replaced[replaced.length - 1]?.trim() !== '') replaced.push('');
    replaced.push('# Anthropic Managed Agents (provisioned by scripts/provision-managed-agents.ts)');
    replaced.push(...tail);
  }

  writeFileSync(DEV_VARS_PATH, replaced.join('\n'));
}

async function provisionEnvironment(client: Anthropic): Promise<string> {
  // Single shared environment is enough — none of the three agents need
  // unique container packages. Unrestricted networking so web_search can hit
  // arbitrary domains.
  const env = await (client.beta as unknown as {
    environments: {
      create(params: {
        name: string;
        config: { type: 'cloud'; networking: { type: 'unrestricted' } };
      }): Promise<{ id: string }>;
    };
  }).environments.create({
    name: 'aether-shared',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  });
  return env.id;
}

async function provisionAgent(
  client: Anthropic,
  spec: AgentSpec,
  environmentId: string
): Promise<ProvisionResult> {
  const agent = await (client.beta as unknown as {
    agents: {
      create(params: {
        name: string;
        model: string;
        system: string;
        tools?: Array<{ type: string }>;
      }): Promise<{ id: string; version: number }>;
    };
  }).agents.create({
    name: spec.name,
    model: 'claude-opus-4-7',
    system: spec.system,
    ...(spec.tools.length > 0 ? { tools: spec.tools } : {}),
  });

  return {
    envPrefix: spec.envPrefix,
    agentId: agent.id,
    agentVersion: agent.version,
    environmentId,
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set. Aborting.');
    process.exit(1);
  }

  const existing = readDevVars();
  const client = new Anthropic({ apiKey });

  // Skip if all three agent IDs are already present in .dev.vars (unless --force).
  const allPresent = SPECS.every(
    (s) =>
      existing.has(`ANTHROPIC_${s.envPrefix}_AGENT_ID`) &&
      existing.has(`ANTHROPIC_${s.envPrefix}_ENVIRONMENT_ID`)
  );
  if (allPresent && !FORCE) {
    console.log(
      '✓ all three agent IDs already in .dev.vars. Pass --force to re-provision.'
    );
    return;
  }

  console.log('▸ creating shared environment...');
  const environmentId = await provisionEnvironment(client);
  console.log(`  environment_id=${environmentId}`);

  console.log('▸ creating agents...');
  const results: ProvisionResult[] = [];
  for (const spec of SPECS) {
    const r = await provisionAgent(client, spec, environmentId);
    console.log(
      `  ${spec.name}: agent_id=${r.agentId} version=${r.agentVersion}`
    );
    results.push(r);
  }

  const updates: Record<string, string> = {};
  for (const r of results) {
    updates[`ANTHROPIC_${r.envPrefix}_AGENT_ID`] = r.agentId;
    updates[`ANTHROPIC_${r.envPrefix}_ENVIRONMENT_ID`] = r.environmentId;
  }
  writeDevVars(updates);

  console.log('');
  console.log('✓ wrote IDs to .dev.vars:');
  for (const [k, v] of Object.entries(updates)) {
    console.log(`  ${k}=${v}`);
  }
  console.log('');
  console.log('Next: restart `npm run dev` so the new env vars get picked up.');
}

main().catch((err) => {
  console.error('✗ provisioning failed:', err);
  process.exit(1);
});
