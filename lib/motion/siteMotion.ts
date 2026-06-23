import { extractSiteFacts, type EvidenceClaim } from '@/lib/research/evidence-facts';
import { parseHttpUrlInput } from '@/lib/url/normalize';
import {
  buildRepoLaunchMotionProject,
  type BuildRepoLaunchMotionProjectInput,
} from './storyboard';
import { materializeMotionTimeline } from './timeline';
import type {
  AppProfile,
  MotionClaimReceipt,
  MotionPlatformTarget,
  MotionProject,
  MotionProjectKind,
  MotionProvenanceRef,
  MotionWorkflowMode,
} from './project';

export type SiteMotionProjectKind = Exclude<MotionProjectKind, 'pr'>;

export interface BuildSiteMotionProjectFromUrlInput {
  id: string;
  workspaceId: string;
  siteUrl: string;
  siteLabel?: string;
  projectKind: SiteMotionProjectKind;
  workflowMode?: MotionWorkflowMode;
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  materializeTimeline?: boolean;
  createdAt: number;
}

export interface BuildSiteMotionProjectFromUrlOptions {
  fetcher?: typeof fetch;
}

const TECH_PATTERNS: Array<[string, RegExp]> = [
  ['Next.js', /\bNext\.?js\b/i],
  ['React', /\bReact\b/i],
  ['TypeScript', /\bTypeScript\b/i],
  ['JavaScript', /\bJavaScript\b/i],
  ['Cloudflare Workers', /\bCloudflare Workers?\b/i],
  ['Convex', /\bConvex\b/i],
  ['tldraw', /\btldraw\b/i],
  ['Remotion', /\bRemotion\b/i],
  ['HyperFrames', /\bHyperFrames\b/i],
  ['Tailwind', /\bTailwind\b/i],
];

export async function buildSiteMotionProjectFromUrl(
  input: BuildSiteMotionProjectFromUrlInput,
  options: BuildSiteMotionProjectFromUrlOptions = {}
): Promise<MotionProject> {
  const normalizedSiteUrl = normalizeSiteUrl(input.siteUrl);
  const html = await fetchSiteHtml(normalizedSiteUrl, options.fetcher ?? fetch);
  const facts = extractSiteFacts({
    html,
    url: normalizedSiteUrl,
    name: input.siteLabel,
  });
  const claims = facts.claims.map(evidenceClaimToMotionClaim);
  const project = buildRepoLaunchMotionProject({
    id: input.id,
    workspaceId: input.workspaceId,
    projectKind: input.projectKind,
    workflowMode: input.workflowMode,
    audience: input.audience,
    tone: input.tone,
    appProfile: buildAppProfile({
      name: facts.name,
      description: facts.description,
      siteUrl: normalizedSiteUrl,
      claims: facts.claims,
      html,
    }),
    claims,
    platformTargets: input.platformTargets,
    createdAt: input.createdAt,
  } satisfies BuildRepoLaunchMotionProjectInput);
  const siteProject = withSiteCaptureNode(project, normalizedSiteUrl);

  if (!input.materializeTimeline) return siteProject;

  return materializeMotionTimeline(siteProject, { updatedAt: input.createdAt });
}

function normalizeSiteUrl(raw: string): string {
  const url = parseHttpUrlInput(raw);
  url.hash = '';
  return url.toString();
}

async function fetchSiteHtml(siteUrl: string, fetcher: typeof fetch): Promise<string> {
  const res = await fetcher(siteUrl);
  if (!res.ok) {
    throw new Error(`Site motion source failed (${res.status} ${res.statusText})`);
  }

  return await res.text();
}

function buildAppProfile(input: {
  name: string;
  description: string;
  siteUrl: string;
  claims: EvidenceClaim[];
  html: string;
}): AppProfile {
  return {
    name: input.name,
    siteUrl: input.siteUrl,
    summary: input.description,
    stack: extractStack(input.claims, input.html),
  };
}

function extractStack(claims: EvidenceClaim[], html: string): string[] {
  const text = `${claims.map((claim) => claim.text).join(' ')} ${html}`;
  return TECH_PATTERNS.flatMap(([label, pattern]) => (pattern.test(text) ? [label] : []));
}

function evidenceClaimToMotionClaim(claim: EvidenceClaim): MotionClaimReceipt {
  return {
    text: claim.text,
    source: evidenceSourceToMotionProvenance(claim.source),
  };
}

function evidenceSourceToMotionProvenance(
  source: EvidenceClaim['source']
): MotionProvenanceRef {
  if (source.kind === 'repo' || source.kind === 'site') {
    return { kind: source.kind, ref: source.ref };
  }

  return { kind: 'upload', ref: source.ref };
}

function withSiteCaptureNode(project: MotionProject, siteUrl: string): MotionProject {
  const sourceRefs = project.sourceRefs.filter((source) => source.kind === 'site');
  const captureNode = {
    id: 'node-site-capture-plan',
    kind: 'capture' as const,
    inputRefs: [siteUrl],
    outputRefs: sourceRefs.map((source) => source.ref),
    status: 'planned' as const,
    provenance: sourceRefs,
  };

  return {
    ...project,
    graphNodes: [
      captureNode,
      ...project.graphNodes.filter((node) => node.id !== 'node-repo-ingest'),
    ],
  };
}
