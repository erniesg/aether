import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MotionProvenanceRef, TimelineClip, TimelineTrack } from '@/lib/motion/project';
import type {
  MotionRenderEngine,
  MotionRenderOutput,
  MotionRenderRequest,
  MotionRenderSourceFile,
} from './types';
import type { MotionRenderRunner, MotionRenderRunnerResult } from './local-render';

export interface RenderCommandCall {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export type RenderCommandExecutor = (call: RenderCommandCall) => Promise<void>;
export type RenderFileExists = (filePath: string) => Promise<boolean> | boolean;
export type RenderWriteTextFile = (filePath: string, contents: string) => Promise<void> | void;

export interface CreateCommandRenderRunnerOptions {
  projectDir: string;
  available?: boolean;
  command?: string;
  packageName?: string;
  runCommand?: RenderCommandExecutor;
  fileExists?: RenderFileExists;
  writeTextFile?: RenderWriteTextFile;
}

export interface CreateRemotionCommandRenderRunnerOptions
  extends CreateCommandRenderRunnerOptions {
  entryPoint?: string;
}

export interface CreateHyperFramesCommandRenderRunnerOptions
  extends CreateCommandRenderRunnerOptions {
  quality?: 'draft' | 'standard' | 'high';
}

interface EngineDefinition {
  engine: MotionRenderEngine;
  provenanceRef: string;
  commandPlan(
    request: MotionRenderRequest,
    output: MotionRenderOutput,
    outputPath: string,
    propsPath: string
  ): RenderCommandCall | null;
}

export function createRemotionCommandRenderRunner(
  options: CreateRemotionCommandRenderRunnerOptions
): MotionRenderRunner {
  const command = options.command ?? 'npx';
  const packageName = options.packageName ?? 'remotion';

  return createCommandRenderRunner(options, {
    engine: 'remotion',
    provenanceRef: 'remotion-command-runner',
    commandPlan(request, output, outputPath, propsPath) {
      const entryPoint = remotionEntryPoint(request, options.entryPoint);

      if (output.kind === 'video') {
        return {
          command,
          args: [
            packageName,
            'render',
            entryPoint,
            request.compositionId,
            outputPath,
            '--fps',
            String(request.fps),
            '--duration',
            String(request.durationFrames),
            '--width',
            String(output.width),
            '--height',
            String(output.height),
            '--props',
            propsPath,
          ],
          cwd: options.projectDir,
        };
      }

      if (output.kind === 'poster') {
        return {
          command,
          args: [
            packageName,
            'still',
            entryPoint,
            request.compositionId,
            outputPath,
            '--frame',
            '0',
            '--width',
            String(output.width),
            '--height',
            String(output.height),
            '--props',
            propsPath,
          ],
          cwd: options.projectDir,
        };
      }

      return null;
    },
  });
}

export function createHyperFramesCommandRenderRunner(
  options: CreateHyperFramesCommandRenderRunnerOptions
): MotionRenderRunner {
  const command = options.command ?? 'npx';
  const packageName = options.packageName ?? 'hyperframes';
  const quality = options.quality ?? 'standard';

  return createCommandRenderRunner(options, {
    engine: 'hyperframes',
    provenanceRef: 'hyperframes-command-runner',
    commandPlan(request, output, outputPath) {
      if (output.kind === 'video') {
        return {
          command,
          args: [
            packageName,
            'render',
            '--output',
            outputPath,
            '--fps',
            String(request.fps),
            '--quality',
            quality,
          ],
          cwd: options.projectDir,
        };
      }

      if (output.kind === 'poster') {
        return {
          command,
          args: [packageName, 'snapshot', '.', '--at', '0', '--output', outputPath],
          cwd: options.projectDir,
        };
      }

      return null;
    },
  });
}

function createCommandRenderRunner(
  options: CreateCommandRenderRunnerOptions,
  definition: EngineDefinition
): MotionRenderRunner {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const fileExists = options.fileExists ?? ((filePath) => existsSync(filePath));
  const writeTextFile = options.writeTextFile ?? defaultWriteTextFile;
  const provenance = {
    kind: 'provider',
    ref: definition.provenanceRef,
  } satisfies MotionProvenanceRef;

  return {
    available: () => options.available ?? true,
    async render(request) {
      if (request.engine !== definition.engine) {
        throw new Error(`${definition.provenanceRef} cannot render ${request.engine} requests`);
      }

      await writeSourceFiles(options.projectDir, request.sourceFiles ?? [], writeTextFile);

      const propsPath = propsFilePath(options.projectDir, request);
      await writeTextFile(propsPath, renderPropsJson(request));

      for (const output of request.outputs) {
        const outputPath = absoluteOutputPath(options.projectDir, output.path);
        await writeSidecarIfNeeded(request, output, outputPath, writeTextFile);

        const commandCall = definition.commandPlan(request, output, outputPath, propsPath);
        if (commandCall) await runCommand(commandCall);

        if (!(await fileExists(outputPath))) {
          throw new Error(`render command did not produce ${outputPath}`);
        }
      }

      return {
        outputs: request.outputs.map((output) => ({
          outputId: output.id,
          assetUrl: pathToFileURL(absoluteOutputPath(options.projectDir, output.path)).href,
          provenance: [provenance],
        })),
        provenance: [provenance],
      } satisfies MotionRenderRunnerResult;
    },
  };
}

async function writeSidecarIfNeeded(
  request: MotionRenderRequest,
  output: MotionRenderOutput,
  outputPath: string,
  writeTextFile: RenderWriteTextFile
): Promise<void> {
  if (output.kind === 'subtitle') {
    await writeTextFile(outputPath, webVttFromTracks(request.tracks, request.fps));
    return;
  }

  if (output.kind === 'transcript') {
    await writeTextFile(outputPath, transcriptFromTracks(request.tracks));
    return;
  }

  if (output.kind === 'manifest') {
    await writeTextFile(outputPath, renderManifestJson(request));
  }
}

function webVttFromTracks(tracks: TimelineTrack[], fps: number): string {
  const cues = captionClips(tracks).map(
    (clip, index) =>
      `${index + 1}\n${timecode(clip.startFrame, fps)} --> ${timecode(
        clip.startFrame + clip.durationFrames,
        fps
      )}\n${clipText(clip)}`
  );

  return ['WEBVTT', ...cues].join('\n\n') + '\n';
}

function transcriptFromTracks(tracks: TimelineTrack[]): string {
  return captionClips(tracks)
    .map(clipText)
    .filter(Boolean)
    .join('\n');
}

function renderManifestJson(request: MotionRenderRequest): string {
  return JSON.stringify(
    {
      requestId: request.id,
      projectId: request.projectId,
      draftId: request.draftId,
      engine: request.engine,
      compositionId: request.compositionId,
      fps: request.fps,
      durationFrames: request.durationFrames,
      outputs: request.outputs.map((output) => ({
        id: output.id,
        kind: output.kind,
        path: output.path,
        platform: output.platform,
        aspectRatio: output.aspectRatio,
        width: output.width,
        height: output.height,
        mimeType: output.mimeType,
      })),
      sourceFiles: request.sourceFiles?.map((file) => ({
        kind: file.kind,
        path: file.path,
        mimeType: file.mimeType,
      })) ?? [],
      provenance: request.provenance,
    },
    null,
    2
  );
}

function renderPropsJson(request: MotionRenderRequest): string {
  return JSON.stringify(
    {
      projectId: request.projectId,
      draftId: request.draftId,
      compositionId: request.compositionId,
      fps: request.fps,
      durationFrames: request.durationFrames,
      tracks: request.tracks,
      outputs: request.outputs,
      sourceFiles: request.sourceFiles?.map((file) => ({
        kind: file.kind,
        path: file.path,
        mimeType: file.mimeType,
      })) ?? [],
      provenance: request.provenance,
    },
    null,
    2
  );
}

function captionClips(tracks: TimelineTrack[]): TimelineClip[] {
  return tracks
    .filter((track) => track.kind === 'caption')
    .flatMap((track) => track.clips)
    .sort((left, right) => left.startFrame - right.startFrame);
}

function clipText(clip: TimelineClip): string {
  const text = clip.props.text ?? clip.props.narration;
  return typeof text === 'string' ? text : '';
}

function timecode(frame: number, fps: number): string {
  const totalMs = Math.round((frame / fps) * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(ms).padStart(3, '0')}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function propsFilePath(projectDir: string, request: MotionRenderRequest): string {
  return path.join(projectDir, 'renders', request.projectId, `${request.id}.props.json`);
}

async function writeSourceFiles(
  projectDir: string,
  sourceFiles: MotionRenderSourceFile[],
  writeTextFile: RenderWriteTextFile
): Promise<void> {
  for (const sourceFile of sourceFiles) {
    await writeTextFile(absoluteOutputPath(projectDir, sourceFile.path), sourceFile.contents);
  }
}

function absoluteOutputPath(projectDir: string, outputPath: string): string {
  return path.isAbsolute(outputPath) ? outputPath : path.join(projectDir, outputPath);
}

function remotionEntryPoint(request: MotionRenderRequest, configuredEntryPoint?: string): string {
  const generatedEntryPoint = request.sourceFiles?.find(
    (file) => file.kind === 'entry' && /\.(tsx?|jsx?)$/.test(file.path)
  )?.path;
  const entryPoint = configuredEntryPoint ?? generatedEntryPoint;

  if (!entryPoint) {
    throw new Error('remotion command runner requires an entryPoint or generated entry source file');
  }

  return entryPoint;
}

async function defaultRunCommand(call: RenderCommandCall): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(
      call.command,
      call.args,
      {
        cwd: call.cwd,
        env: call.env ? { ...process.env, ...call.env } : process.env,
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve();
      }
    );
  });
}

function defaultWriteTextFile(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}
