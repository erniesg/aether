import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MotionProvenanceRef } from '@/lib/motion/project';
import type {
  MotionGeneratedVideoClip,
  MotionImageToVideoOutput,
  MotionImageToVideoProvider,
  MotionImageToVideoRequest,
  MotionImageToVideoResult,
} from './types';

export interface ImageToVideoCommandCall {
  command: string;
  args: string[];
  cwd: string;
  requestPath: string;
}

export interface ImageToVideoCommandOutputArtifact {
  id: string;
  assetUrl?: string;
  path?: string;
  durationMs?: number;
  provenance?: MotionProvenanceRef[];
}

export interface ImageToVideoCommandOutput {
  artifact?: ImageToVideoCommandOutputArtifact;
  artifacts?: ImageToVideoCommandOutputArtifact[];
}

export type ImageToVideoCommandExecutor = (
  call: ImageToVideoCommandCall
) => Promise<ImageToVideoCommandOutput | void>;
export type ImageToVideoFileExists = (filePath: string) => Promise<boolean> | boolean;
export type ImageToVideoWriteTextFile = (
  filePath: string,
  contents: string
) => Promise<void> | void;

export interface CreateCommandImageToVideoProviderOptions {
  id?: string;
  displayName?: string;
  projectDir?: string;
  command?: string;
  args?: string[];
  available?: boolean;
  runCommand?: ImageToVideoCommandExecutor;
  fileExists?: ImageToVideoFileExists;
  writeTextFile?: ImageToVideoWriteTextFile;
}

interface ImageToVideoCommandPayload {
  id: string;
  projectId: string;
  draftId: string;
  clipId: string;
  sourceAssetId: string;
  source: MotionImageToVideoRequest['source'];
  prompt: string;
  aspectRatio: MotionImageToVideoRequest['aspectRatio'];
  fps: number;
  durationFrames: number;
  width: number;
  height: number;
  output: MotionImageToVideoOutput & { absolutePath: string };
  provenance: MotionProvenanceRef[];
}

export function createCommandImageToVideoProvider(
  options: CreateCommandImageToVideoProviderOptions
): MotionImageToVideoProvider {
  const id = envValue(options.id) ?? 'image-video-command';
  const displayName = envValue(options.displayName) ?? 'Command image-to-video generation';
  const projectDir = envValue(options.projectDir);
  const command = envValue(options.command);
  const args = options.args ?? [];
  const runCommand = options.runCommand ?? defaultRunCommand;
  const fileExists = options.fileExists ?? ((filePath) => existsSync(filePath));
  const writeTextFile = options.writeTextFile ?? defaultWriteTextFile;
  const providerRef = { kind: 'provider', ref: id } satisfies MotionProvenanceRef;

  return {
    id,
    displayName,
    available: () => Boolean((options.available ?? true) && projectDir && command),
    async generate(req: MotionImageToVideoRequest): Promise<MotionImageToVideoResult> {
      if (!projectDir) throw new Error('AETHER_IMAGE_TO_VIDEO_PROJECT_DIR not set');
      if (!command) throw new Error('AETHER_IMAGE_TO_VIDEO_COMMAND not set');

      const requestPath = requestPayloadPath(projectDir, req);
      await writeTextFile(
        requestPath,
        JSON.stringify(imageToVideoCommandPayload(req, projectDir), null, 2)
      );

      const commandOutput = await runCommand({
        command,
        args: [...args, requestPath],
        cwd: projectDir,
        requestPath,
      });
      const artifact = await generatedArtifact({
        req,
        projectDir,
        providerRef,
        output: commandOutput,
        fileExists,
      });

      return {
        providerId: id,
        artifacts: [artifact],
        provenance: uniqueProvenance([providerRef, ...req.provenance]),
      };
    },
  };
}

async function generatedArtifact(input: {
  req: MotionImageToVideoRequest;
  projectDir: string;
  providerRef: MotionProvenanceRef;
  output: ImageToVideoCommandOutput | void;
  fileExists: ImageToVideoFileExists;
}): Promise<MotionGeneratedVideoClip> {
  const outputArtifact = outputArtifactFor(input.output);
  if (outputArtifact) {
    if (outputArtifact.id !== input.req.output.id) {
      throw new Error(
        `image-to-video command returned unplanned image-to-video artifact ${outputArtifact.id}`
      );
    }
    return hydrateArtifact({
      planned: input.req.output,
      requestId: input.req.id,
      projectDir: input.projectDir,
      providerRef: input.providerRef,
      output: outputArtifact,
    });
  }

  const absolutePath = absoluteOutputPath(input.projectDir, input.req.output.path);
  if (!(await input.fileExists(absolutePath))) {
    throw new Error(`image-to-video command did not produce ${absolutePath}`);
  }

  return hydrateArtifact({
    planned: input.req.output,
    requestId: input.req.id,
    projectDir: input.projectDir,
    providerRef: input.providerRef,
  });
}

function outputArtifactFor(
  output: ImageToVideoCommandOutput | void
): ImageToVideoCommandOutputArtifact | null {
  if (!output) return null;
  if (output.artifact) return output.artifact;
  if (!output.artifacts) return null;
  if (output.artifacts.length !== 1) {
    throw new Error('image-to-video command must return exactly one generated artifact');
  }
  return output.artifacts[0] ?? null;
}

function hydrateArtifact(input: {
  planned: MotionImageToVideoOutput;
  requestId: string;
  projectDir: string;
  providerRef: MotionProvenanceRef;
  output?: ImageToVideoCommandOutputArtifact;
}): MotionGeneratedVideoClip {
  const pathValue = input.output?.path ?? input.planned.path;
  return {
    ...input.planned,
    path: pathValue,
    requestId: input.requestId,
    assetUrl:
      input.output?.assetUrl ?? pathToFileURL(absoluteOutputPath(input.projectDir, pathValue)).href,
    ...(input.output?.durationMs !== undefined ? { durationMs: input.output.durationMs } : {}),
    provenance: uniqueProvenance([
      input.providerRef,
      ...input.planned.provenance,
      ...(input.output?.provenance ?? []),
    ]),
  };
}

function imageToVideoCommandPayload(
  req: MotionImageToVideoRequest,
  projectDir: string
): ImageToVideoCommandPayload {
  return {
    id: req.id,
    projectId: req.projectId,
    draftId: req.draftId,
    clipId: req.clipId,
    sourceAssetId: req.sourceAssetId,
    source: req.source,
    prompt: req.prompt,
    aspectRatio: req.aspectRatio,
    fps: req.fps,
    durationFrames: req.durationFrames,
    width: req.width,
    height: req.height,
    output: {
      ...req.output,
      absolutePath: absoluteOutputPath(projectDir, req.output.path),
    },
    provenance: req.provenance,
  };
}

function requestPayloadPath(projectDir: string, req: MotionImageToVideoRequest): string {
  return path.join(
    projectDir,
    '.aether',
    'image-to-video-requests',
    `${safePathSegment(req.id)}.json`
  );
}

function absoluteOutputPath(projectDir: string, outputPath: string): string {
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, outputPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`image-to-video output path escapes project directory: ${outputPath}`);
  }
  return resolved;
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function defaultWriteTextFile(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function defaultRunCommand(
  call: ImageToVideoCommandCall
): Promise<ImageToVideoCommandOutput | void> {
  return new Promise((resolve, reject) => {
    execFile(
      call.command,
      call.args,
      { cwd: call.cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        const text = stdout.trim();
        if (!text) {
          resolve();
          return;
        }

        try {
          resolve(JSON.parse(text) as ImageToVideoCommandOutput);
        } catch {
          reject(new Error('image-to-video command stdout must be JSON when non-empty'));
        }
      }
    );
  });
}

function uniqueProvenance(refs: MotionProvenanceRef[]): MotionProvenanceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
