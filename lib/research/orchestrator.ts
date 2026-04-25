/**
 * Research multi-agent supervisor — issue #98.
 *
 * Fans out three workers concurrently via Promise.all:
 *   researcher        — describes reference assets per platform / hashtag / account / URL
 *   clusterer         — groups references into aesthetic clusters
 *   aesthetic-analyzer — labels clusters and proposes 1-3 moodboard prompts per cluster
 *
 * Design notes (mirrors lib/brand/propose.ts — the Q1 reference):
 *   • Direct-SDK supervisor + 3 workers (NOT Managed Agents — see issue #100 for that path).
 *   • Three named system prompts, each cached with cache_control: { type: 'ephemeral' }.
 *   • runWorker is the seam for a future Managed Agents migration.
 *   • Fail-soft: each worker wrapped in try/catch so one failure does not block the others.
 *   • Token cost guard: rejects seeds with < MIN_REFS_FOR_MULTI_AGENT refs (default 3)
 *     and falls back to single-pass planResearch.
 *   • Provider mandate: claude-opus-4-7 only.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/agent/generate';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import type { ClusterCard, ClusterDirection } from '@/lib/clusters/types';
import type { CreatorContextModel } from '@/lib/context/model';
import { planResearch } from '@/lib/research/research';
import {
  RESEARCHER_SYSTEM,
  CLUSTERER_SYSTEM,
  AESTHETIC_ANALYZER_SYSTEM,
} from './prompts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClusterLensSnapshot {
  seedText: string;
  cards: ClusterCard[];
  directions: ClusterDirection[];
  moodboardPrompts: string[];
  assembledAt: string;
  fallback?: boolean;
  /**
   * Debug-only field — not included in the public API response by default.
   * Only populated when the caller opts in (e.g. `?debug=1` query param).
   * Worker errors are always logged server-side regardless.
   */
  debug?: {
    workerErrors: {
      researcher?: string;
      clusterer?: string;
      aestheticAnalyzer?: string;
    };
  };
}

export interface OrchestrateResearchOptions {
  seedText: string;
  creatorContext?: Partial<CreatorContextModel>;
  refs?: ReferenceRecord[];
  /** Override the Anthropic client (used in tests). */
  client?: Anthropic;
}

// ---------------------------------------------------------------------------
// Token cost guard — configurable via env var
// ---------------------------------------------------------------------------

const DEFAULT_MIN_REFS = 3;

function getMinRefsThreshold(): number {
  const raw = process.env.MIN_REFS_FOR_MULTI_AGENT;
  if (!raw) return DEFAULT_MIN_REFS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_REFS;
}

// ---------------------------------------------------------------------------
// Tool definitions for each worker
// ---------------------------------------------------------------------------

const RESEARCHER_TOOL: Anthropic.Tool = {
  name: 'researcher_output',
  description: 'Emit the fetched reference descriptors for each research target. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      fetchedRefs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:          { type: 'string' },
            platform:    { type: 'string' },
            sourceUrl:   { type: 'string' },
            thumbnailUrl: { type: 'string' },
            tags:        { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'platform', 'sourceUrl', 'thumbnailUrl', 'tags'],
        },
      },
    },
    required: ['fetchedRefs'],
  } as unknown as Anthropic.Tool['input_schema'],
};

const CLUSTERER_TOOL: Anthropic.Tool = {
  name: 'clusterer_output',
  description: 'Emit the aesthetic cluster groupings for the reference set. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clusterId:  { type: 'string' },
            label:      { type: 'string' },
            memberIds:  { type: 'array', items: { type: 'string' } },
          },
          required: ['clusterId', 'label', 'memberIds'],
        },
      },
    },
    required: ['clusters'],
  } as unknown as Anthropic.Tool['input_schema'],
};

const AESTHETIC_TOOL: Anthropic.Tool = {
  name: 'aesthetic_output',
  description: 'Emit the aesthetic labels and moodboard prompts for each cluster. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      clusterAnalyses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            clusterId:        { type: 'string' },
            direction:        { type: 'string' },
            moodboardPrompts: { type: 'array', items: { type: 'string' } },
          },
          required: ['clusterId', 'direction', 'moodboardPrompts'],
        },
      },
    },
    required: ['clusterAnalyses'],
  } as unknown as Anthropic.Tool['input_schema'],
};

// ---------------------------------------------------------------------------
// Worker runner — seam for future Managed Agents migration.
//
// To migrate: replace the body of runWorker with a managed-agent session call.
// The three call-sites in orchestrateResearch stay identical.
// ---------------------------------------------------------------------------

interface WorkerParams {
  name: 'researcher' | 'clusterer' | 'aestheticAnalyzer';
  systemPrompt: string;
  tool: Anthropic.Tool;
  userMessage: string;
  client: Anthropic;
}

async function runWorker(params: WorkerParams): Promise<Record<string, unknown>> {
  const { systemPrompt, tool, userMessage, client } = params;

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
  });

  const toolBlock = msg.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> =>
      b.type === 'tool_use' && b.name === tool.name
  );
  if (!toolBlock) {
    throw new Error(`Worker ${params.name}: Claude did not emit a ${tool.name} tool call`);
  }
  return toolBlock.input as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input serialiser
// ---------------------------------------------------------------------------

function buildSeedMessage(seedText: string, refs: ReferenceRecord[]): string {
  const lines: string[] = [`Research seed: "${seedText}"`, ''];
  if (refs.length > 0) {
    lines.push(`Existing refs (${refs.length}):`);
    for (const ref of refs.slice(0, 8)) {
      const tags = ref.tags && ref.tags.length > 0 ? ` [${ref.tags.slice(0, 4).join(', ')}]` : '';
      lines.push(`  ${ref.id} · ${ref.attribution.source}${tags}`);
    }
  }
  return lines.join('\n');
}

function buildClusterMessage(
  seedText: string,
  refs: ReferenceRecord[],
  fetchedRefs: unknown[]
): string {
  const lines: string[] = [`Research seed: "${seedText}"`, ''];
  const allIds = [
    ...refs.map((r) => r.id),
    ...(fetchedRefs as Array<{ id?: string }>).map((f) => f.id).filter(Boolean),
  ];
  if (allIds.length > 0) {
    lines.push(`Reference ids to cluster (${allIds.length}):`);
    for (const id of allIds.slice(0, 16)) lines.push(`  ${id}`);
  }
  return lines.join('\n');
}

function buildAestheticMessage(clusters: unknown[]): string {
  const lines: string[] = ['Clusters to analyse:', ''];
  for (const c of clusters as Array<{ clusterId: string; label: string; memberIds: string[] }>) {
    lines.push(`  ${c.clusterId} · "${c.label}" (${(c.memberIds ?? []).length} members)`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parsers — convert raw tool output to typed domain shapes
// ---------------------------------------------------------------------------

interface FetchedRef {
  id: string;
  platform: string;
  sourceUrl: string;
  thumbnailUrl: string;
  tags: string[];
}

function parseFetchedRefs(raw: Record<string, unknown>): FetchedRef[] {
  if (!Array.isArray(raw.fetchedRefs)) return [];
  return (raw.fetchedRefs as unknown[]).flatMap((item): FetchedRef[] => {
    if (!item || typeof item !== 'object') return [];
    const f = item as Record<string, unknown>;
    if (typeof f.id !== 'string' || typeof f.platform !== 'string') return [];
    return [{
      id: f.id,
      platform: typeof f.platform === 'string' ? f.platform : 'web',
      sourceUrl: typeof f.sourceUrl === 'string' ? f.sourceUrl : '',
      thumbnailUrl: typeof f.thumbnailUrl === 'string' ? f.thumbnailUrl : '',
      tags: Array.isArray(f.tags) ? (f.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    }];
  });
}

interface ClusterRaw {
  clusterId: string;
  label: string;
  memberIds: string[];
}

function parseClusters(raw: Record<string, unknown>): ClusterRaw[] {
  if (!Array.isArray(raw.clusters)) return [];
  return (raw.clusters as unknown[]).flatMap((item): ClusterRaw[] => {
    if (!item || typeof item !== 'object') return [];
    const c = item as Record<string, unknown>;
    if (typeof c.clusterId !== 'string') return [];
    return [{
      clusterId: c.clusterId,
      label: typeof c.label === 'string' ? c.label : c.clusterId,
      memberIds: Array.isArray(c.memberIds)
        ? (c.memberIds as unknown[]).filter((m): m is string => typeof m === 'string')
        : [],
    }];
  });
}

interface ClusterAnalysis {
  clusterId: string;
  direction: string;
  moodboardPrompts: string[];
}

function parseAesthetics(raw: Record<string, unknown>): ClusterAnalysis[] {
  if (!Array.isArray(raw.clusterAnalyses)) return [];
  return (raw.clusterAnalyses as unknown[]).flatMap((item): ClusterAnalysis[] => {
    if (!item || typeof item !== 'object') return [];
    const a = item as Record<string, unknown>;
    if (typeof a.clusterId !== 'string') return [];
    return [{
      clusterId: a.clusterId,
      direction: typeof a.direction === 'string' ? a.direction : a.clusterId,
      moodboardPrompts: Array.isArray(a.moodboardPrompts)
        ? (a.moodboardPrompts as unknown[]).filter((p): p is string => typeof p === 'string')
        : [],
    }];
  });
}

// ---------------------------------------------------------------------------
// Reducer — synthesise worker outputs into ClusterLensSnapshot
// ---------------------------------------------------------------------------

function assembleSnapshot(
  seedText: string,
  refs: ReferenceRecord[],
  fetchedRefs: FetchedRef[],
  clusters: ClusterRaw[],
  aesthetics: ClusterAnalysis[],
  workerErrors: NonNullable<ClusterLensSnapshot['debug']>['workerErrors']
): ClusterLensSnapshot {
  const now = Date.now();

  // Build a label lookup from aesthetic analysis
  const labelByCluster = new Map<string, string>(
    aesthetics.map((a) => [a.clusterId, a.direction])
  );

  // Build cards from existing refs + fetched refs, assigned to their clusters
  const memberOfCluster = new Map<string, string>(); // refId → clusterId
  const clusterLabel = new Map<string, string>();
  for (const cluster of clusters) {
    const label = labelByCluster.get(cluster.clusterId) ?? cluster.label;
    clusterLabel.set(cluster.clusterId, label);
    for (const memberId of cluster.memberIds) {
      memberOfCluster.set(memberId, cluster.clusterId);
    }
  }

  // Cards from existing refs
  const cards: ClusterCard[] = refs.map((ref, idx) => {
    const clusterId = memberOfCluster.get(ref.id) ?? '-1';
    return {
      referenceId: ref.id,
      clusterId,
      clusterLabel: clusterLabel.get(clusterId) ?? 'uncategorised',
      thumbnailUrl: ref.previewUrl,
      attribution: ref.attribution,
      column: 'Found' as const,
      movedAt: now - idx,
    };
  });

  // Cards from fetched stubs (no duplicates)
  const existingIds = new Set(refs.map((r) => r.id));
  for (const [idx, fetched] of fetchedRefs.entries()) {
    if (existingIds.has(fetched.id)) continue;
    const clusterId = memberOfCluster.get(fetched.id) ?? '-1';
    cards.push({
      referenceId: fetched.id,
      clusterId,
      clusterLabel: clusterLabel.get(clusterId) ?? 'uncategorised',
      thumbnailUrl: fetched.thumbnailUrl,
      attribution: { source: fetched.platform, url: fetched.sourceUrl },
      column: 'Found' as const,
      movedAt: now - refs.length - idx,
    });
  }

  // Directions from clusters, labels upgraded by aesthetics
  const directions: ClusterDirection[] = clusters.map((cluster) => ({
    clusterId: cluster.clusterId,
    label: labelByCluster.get(cluster.clusterId) ?? cluster.label,
    memberCount: cluster.memberIds.length,
  }));

  // All moodboard prompts collected across clusters
  const moodboardPrompts: string[] = aesthetics.flatMap((a) => a.moodboardPrompts);

  const snapshot: ClusterLensSnapshot = {
    seedText,
    cards,
    directions,
    moodboardPrompts,
    assembledAt: new Date().toISOString(),
  };

  if (workerErrors && Object.keys(workerErrors).length > 0) {
    snapshot.debug = { workerErrors };
  }

  return snapshot;
}

// ---------------------------------------------------------------------------
// Single-pass fallback — delegates to planResearch
// ---------------------------------------------------------------------------

function singlePassFallback(
  seedText: string,
  refs: ReferenceRecord[]
): ClusterLensSnapshot {
  const plan = planResearch({ seedText });
  // Build a minimal snapshot shape from the plan targets (no cards, no clusters)
  const cards: ClusterCard[] = refs.map((ref, idx) => ({
    referenceId: ref.id,
    clusterId: '-1',
    clusterLabel: 'uncategorised',
    thumbnailUrl: ref.previewUrl,
    attribution: ref.attribution,
    column: 'Found' as const,
    movedAt: Date.now() - idx,
  }));

  return {
    seedText: plan.seedText,
    cards,
    directions: [],
    moodboardPrompts: [],
    assembledAt: new Date().toISOString(),
    fallback: true,
  };
}

// ---------------------------------------------------------------------------
// Public orchestrator
// ---------------------------------------------------------------------------

export async function orchestrateResearch(
  opts: OrchestrateResearchOptions
): Promise<ClusterLensSnapshot> {
  const { seedText, creatorContext: _creatorContext, refs = [] } = opts;
  const client = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const minRefs = getMinRefsThreshold();
  if (refs.length < minRefs) {
    return singlePassFallback(seedText, refs);
  }

  const seedMessage = buildSeedMessage(seedText, refs);

  // ---------------------------------------------------------------------------
  // Phase 1: researcher + clusterer run in parallel.
  //   - researcher fetches new reference assets for the seed.
  //   - clusterer groups whatever refs are available (existing + seed context).
  //   Both are independent of each other, so Promise.all is correct here.
  // ---------------------------------------------------------------------------
  const [researcherResult, clustererResult] = await Promise.all([
    runWorker({
      name: 'researcher',
      systemPrompt: RESEARCHER_SYSTEM,
      tool: RESEARCHER_TOOL,
      userMessage: `Fetch reference assets for this research seed.\n\n${seedMessage}`,
      client,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return { fetchedRefs: [], _error: msg } as Record<string, unknown>;
    }),

    runWorker({
      name: 'clusterer',
      systemPrompt: CLUSTERER_SYSTEM,
      tool: CLUSTERER_TOOL,
      userMessage: `Cluster these references by aesthetic.\n\n${buildClusterMessage(seedText, refs, [])}`,
      client,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return { clusters: [], _error: msg } as Record<string, unknown>;
    }),
  ]);

  // Parse Phase 1 outputs so Phase 2 can use cluster data
  const fetchedRefs = parseFetchedRefs(researcherResult);
  const clusters = parseClusters(clustererResult);

  // ---------------------------------------------------------------------------
  // Phase 2: aesthetic-analyzer runs AFTER clusterer so it receives actual
  //   cluster output rather than the seed message alone. This is the key
  //   ordering fix — the aesthetic pass needs cluster labels + member IDs to
  //   produce meaningful directions and moodboard prompts.
  // ---------------------------------------------------------------------------
  const aestheticMessage = buildAestheticMessage(clusters);
  const aestheticResult = await runWorker({
    name: 'aestheticAnalyzer',
    systemPrompt: AESTHETIC_ANALYZER_SYSTEM,
    tool: AESTHETIC_TOOL,
    userMessage: `Analyse aesthetics and propose moodboard prompts.\n\n${aestheticMessage}`,
    client,
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return { clusterAnalyses: [], _error: msg } as Record<string, unknown>;
  });

  // Collect per-worker errors (logged server-side; surfaced in debug only)
  const workerErrors: NonNullable<ClusterLensSnapshot['debug']>['workerErrors'] = {};
  if (typeof researcherResult._error === 'string') {
    workerErrors.researcher = researcherResult._error;
  }
  if (typeof clustererResult._error === 'string') {
    workerErrors.clusterer = clustererResult._error;
  }
  if (typeof aestheticResult._error === 'string') {
    workerErrors.aestheticAnalyzer = aestheticResult._error;
  }

  // Log errors server-side regardless of whether debug is enabled
  if (Object.keys(workerErrors).length > 0) {
    console.error('[orchestrateResearch] worker errors:', workerErrors);
  }

  const aesthetics = parseAesthetics(aestheticResult);

  return assembleSnapshot(seedText, refs, fetchedRefs, clusters, aesthetics, workerErrors);
}
