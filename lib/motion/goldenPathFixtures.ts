import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { WorkflowEngine } from '@/lib/workflow/registry';
import type { MotionAgentExecutionHandoff } from './agentHandoff';
import type {
  MotionAspectRatio,
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
