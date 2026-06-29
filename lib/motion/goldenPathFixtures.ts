import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionAgentExecutionHandoff } from './agentHandoff';
import type {
  MotionAspectRatio,
  MotionExecutionGateId,
  MotionPlatform,
  MotionPlatformTarget,
  MotionProject,
  MotionWorkflowMode,
} from './project';
import type { MotionWorkflowIntent } from './workflowRouter';

export interface RepoVideoGoldenPathFixtureInput {
  appName: string;
  description: string;
  routeFiles?: Record<string, string>;
  workspaceId?: string;
  intent?: MotionWorkflowIntent;
  mode?: MotionWorkflowMode;
  audience?: string;
  tone?: string;
  platformTargets?: MotionPlatformTarget[];
  requestedEngines?: WorkflowEngine[];
  createdAt?: number;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  extraFiles?: Record<string, string>;
}

export interface RepoVideoGoldenPathFixture {
  repoPath: string;
  startRequest: RepoVideoGoldenPathStartRequest;
  expectedApps: string[];
  expectedEvidenceLabels: string[];
  cleanup: () => Promise<void>;
}

export interface RepoVideoGoldenPathStartRequest {
  id: string;
  workspaceId: string;
  repoPath: string;
  intent: MotionWorkflowIntent;
  mode: MotionWorkflowMode;
  audience: string;
  tone: string;
  platformTargets: MotionPlatformTarget[];
  requestedEngines: WorkflowEngine[];
  createdAt: number;
}

export interface AssertGoldenPathMotionProjectInput {
  project: MotionProject | null | undefined;
  agentHandoff?: MotionAgentExecutionHandoff | null;
  requireFullAutoReceipts?: boolean;
  fullAutoReviewPacket?: unknown;
}

const DEFAULT_PLATFORM_TARGETS: MotionPlatformTarget[] = [
  { platform: 'x', aspectRatio: '9:16', seconds: 30 },
  { platform: 'linkedin', aspectRatio: '4:5', seconds: 45 },
];
const DEFAULT_REQUESTED_ENGINES: WorkflowEngine[] = ['remotion', 'hyperframes', 'provider'];
const DEFAULT_EVIDENCE_LABELS = [
  'video plan',
  'draft variations',
  'timeline rows',
  'agent handoff',
  'render/export slots',
];

export async function buildRepoVideoGoldenPathFixture(
  input: RepoVideoGoldenPathFixtureInput
): Promise<RepoVideoGoldenPathFixture> {
  const appName = slugifyAppName(input.appName);
  const repoPath = await mkdtemp(join(tmpdir(), 'aether-motion-golden-path-'));
  const routeFiles = input.routeFiles ?? {
    'app/page.tsx': `export default function Page() { return <main>${appName}</main>; }`,
  };

  await writeJson(join(repoPath, 'package.json'), {
    name: appName,
    description: input.description,
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      ...(input.dependencies ?? {}),
    },
    devDependencies: {
      typescript: '^5.0.0',
      ...(input.devDependencies ?? {}),
    },
    scripts: {
      dev: 'next dev',
      ...(input.scripts ?? {}),
    },
  });
  await writeFile(
    join(repoPath, 'README.md'),
    `${input.appName} is a repo-video golden path fixture. ${input.description}\n`
  );
  for (const [relativePath, contents] of Object.entries(routeFiles)) {
    await writeFixtureFile(repoPath, relativePath, contents);
  }
  for (const [relativePath, contents] of Object.entries(input.extraFiles ?? {})) {
    await writeFixtureFile(repoPath, relativePath, contents);
  }

  return {
    repoPath,
    startRequest: {
      id: `motion-${appName}-golden-path`,
      workspaceId: input.workspaceId ?? 'motion-golden-path',
      repoPath,
      intent: input.intent ?? 'launch',
      mode: input.mode ?? 'full-auto',
      audience: input.audience ?? 'builders and creators',
      tone: input.tone ?? 'clear, visual, product-led',
      platformTargets: normalizePlatformTargets(input.platformTargets),
      requestedEngines: [...(input.requestedEngines ?? DEFAULT_REQUESTED_ENGINES)],
      createdAt: input.createdAt ?? 1_782_720_000,
    },
    expectedApps: [appName],
    expectedEvidenceLabels: [...DEFAULT_EVIDENCE_LABELS],
    cleanup: async () => {
      await rm(repoPath, { recursive: true, force: true });
    },
  };
}

export function assertGoldenPathMotionProject(input: AssertGoldenPathMotionProjectInput): void {
  const project = input.project;
  if (!project) throw new Error('golden path requires a motion project');
  if (project.sourceRefs.length === 0) {
    throw new Error('golden path requires source refs');
  }
  if (project.story.length === 0) {
    throw new Error('golden path requires story beats');
  }
  if (project.drafts.length === 0 || !project.drafts.some((draft) => draft.id === project.currentDraftId)) {
    throw new Error('golden path requires draft variations');
  }
  if (!hasTimelineRows(project)) {
    throw new Error('golden path requires timeline rows');
  }
  if (project.exports.length === 0 || !project.graphNodes.some((node) => node.kind === 'render')) {
    throw new Error('golden path requires render/export slots');
  }
  if (project.workflowMode === 'full-auto') {
    assertFullAutoHandoff(input.agentHandoff);
  }
  if (input.requireFullAutoReceipts) {
    assertFullAutoReceipts(project, input.fullAutoReviewPacket);
  }
}

function assertFullAutoHandoff(handoff: MotionAgentExecutionHandoff | null | undefined): void {
  if (!handoff) throw new Error('golden path requires agent handoff');
  if (!handoff.templates.some((template) => template.id === 'full-auto-run')) {
    throw new Error('golden path requires full-auto agent handoff');
  }
  if (!handoff.nextTemplateId) {
    throw new Error('golden path requires next agent handoff action');
  }
}

function assertFullAutoReceipts(project: MotionProject, reviewPacket: unknown): void {
  const history = project.executionHistory ?? [];
  if (history.length === 0) throw new Error('golden path requires full-auto receipts');

  const gateIds = new Set(history.map((entry) => entry.gateId));
  const requiredGateIds: MotionExecutionGateId[] = [
    'capture',
    'visual-source',
    'visual-generation',
    'voice',
    'sync',
    'render',
    'export',
  ];
  const missingGateIds = requiredGateIds.filter((gateId) => !gateIds.has(gateId));
  if (missingGateIds.length > 0) {
    throw new Error(`golden path requires full-auto receipts: ${missingGateIds.join(', ')}`);
  }

  const requiredRenderOutputs = ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'];
  const renderLabels = history
    .filter((entry) => entry.gateId === 'render')
    .flatMap((entry) => entry.receiptLabels);
  const missingRenderOutputs = requiredRenderOutputs.filter(
    (label) => !renderLabels.some((receiptLabel) => receiptLabel.includes(label))
  );
  if (missingRenderOutputs.length > 0) {
    throw new Error(`golden path requires render receipts: ${missingRenderOutputs.join(', ')}`);
  }

  if (!project.graphNodes.some((node) => node.kind === 'export-pack' && node.status === 'done')) {
    throw new Error('golden path requires completed export-pack graph node');
  }
  if (!allClips(project).some(hasGeneratedVideoTake)) {
    throw new Error('golden path requires generated-video take on a timeline clip');
  }
  if (!allClips(project).some(hasVoiceArtifacts)) {
    throw new Error('golden path requires voice audio, word timing, and transcript assets');
  }
  if (!project.exports.some(hasReadyRenderedExport)) {
    throw new Error('golden path requires ready rendered export assets');
  }
  if (!isFullAutoReviewPacket(reviewPacket)) {
    throw new Error('golden path requires saved full-auto review packet');
  }
}

function allClips(project: MotionProject) {
  return [
    ...project.tracks.flatMap((track) => track.clips),
    ...project.drafts.flatMap((draft) => draft.tracks.flatMap((track) => track.clips)),
  ];
}

function hasGeneratedVideoTake(clip: ReturnType<typeof allClips>[number]): boolean {
  return (
    typeof clip.props.generatedVideoAssetId === 'string' &&
    Array.isArray(clip.props.generatedVideoTakes) &&
    clip.props.generatedVideoTakes.length > 0
  );
}

function hasVoiceArtifacts(clip: ReturnType<typeof allClips>[number]): boolean {
  return (
    typeof clip.props.audioAssetId === 'string' &&
    typeof clip.props.wordTimingsAssetId === 'string' &&
    typeof clip.props.transcriptAssetId === 'string'
  );
}

function hasReadyRenderedExport(motionExport: MotionProject['exports'][number]): boolean {
  return (
    motionExport.status === 'ready' &&
    Boolean(
      motionExport.assetId &&
        motionExport.posterAssetId &&
        motionExport.subtitleAssetId &&
        motionExport.transcriptAssetId &&
        motionExport.manifestAssetId
    )
  );
}

function isFullAutoReviewPacket(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const packet = value as {
    kind?: unknown;
    savedArtifacts?: unknown;
    proofLabels?: unknown;
    savedReceiptLabels?: unknown;
  };
  return (
    packet.kind === 'motion-full-auto-review-packet' &&
    Array.isArray(packet.savedArtifacts) &&
    packet.savedArtifacts.length > 0 &&
    Array.isArray(packet.proofLabels) &&
    packet.proofLabels.length > 0 &&
    Array.isArray(packet.savedReceiptLabels) &&
    packet.savedReceiptLabels.length > 0
  );
}

function hasTimelineRows(project: MotionProject): boolean {
  const projectClipCount = project.tracks.reduce((total, track) => total + track.clips.length, 0);
  const draftClipCount = project.drafts.reduce(
    (total, draft) =>
      total + draft.tracks.reduce((trackTotal, track) => trackTotal + track.clips.length, 0),
    0
  );
  return projectClipCount + draftClipCount > 0;
}

function slugifyAppName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'app';
}

function normalizePlatformTargets(value: MotionPlatformTarget[] | undefined): MotionPlatformTarget[] {
  return (value ?? DEFAULT_PLATFORM_TARGETS).map((target) => ({
    platform: target.platform as MotionPlatform,
    aspectRatio: target.aspectRatio as MotionAspectRatio,
    seconds: target.seconds,
  }));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const safePath = safeRelativePath(relativePath);
  const absolutePath = join(root, safePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

function safeRelativePath(value: string): string {
  if (value.startsWith('/') || value.includes('..')) {
    throw new Error(`fixture path must stay inside the repo: ${value}`);
  }
  return value;
}
