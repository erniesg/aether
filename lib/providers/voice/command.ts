import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MotionProvenanceRef } from '@/lib/motion/project';
import type {
  VoiceArtifact,
  VoiceProvider,
  VoiceSynthesisRequest,
  VoiceSynthesisResult,
} from './types';

export interface VoiceCommandCall {
  command: string;
  args: string[];
  cwd: string;
  requestPath: string;
}

export interface VoiceCommandOutputArtifact {
  id: string;
  assetUrl?: string;
  path?: string;
  durationMs?: number;
  provenance?: MotionProvenanceRef[];
}

export interface VoiceCommandOutput {
  artifacts?: VoiceCommandOutputArtifact[];
}

export type VoiceCommandExecutor = (
  call: VoiceCommandCall
) => Promise<VoiceCommandOutput | void>;
export type VoiceFileExists = (filePath: string) => Promise<boolean> | boolean;
export type VoiceWriteTextFile = (filePath: string, contents: string) => Promise<void> | void;

export interface CreateCommandVoiceProviderOptions {
  id?: string;
  displayName?: string;
  projectDir?: string;
  command?: string;
  args?: string[];
  available?: boolean;
  runCommand?: VoiceCommandExecutor;
  fileExists?: VoiceFileExists;
  writeTextFile?: VoiceWriteTextFile;
}

interface VoicePayloadArtifact extends VoiceArtifact {
  absolutePath: string;
}

interface VoiceCommandPayload {
  id: string;
  projectId: string;
  draftId: string;
  clipId: string;
  trackId?: string;
  text: string;
  voiceId?: string;
  startFrame: number;
  durationFrames: number;
  fps: number;
  targetSeconds: number;
  expectedArtifacts: VoicePayloadArtifact[];
  provenance: MotionProvenanceRef[];
}

export function createCommandVoiceProvider(
  options: CreateCommandVoiceProviderOptions
): VoiceProvider {
  const id = envValue(options.id) ?? 'voice-command';
  const displayName = envValue(options.displayName) ?? 'Command voice synthesis';
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
    async synthesize(req: VoiceSynthesisRequest): Promise<VoiceSynthesisResult> {
      if (!projectDir) throw new Error('AETHER_VOICE_SYNTHESIS_PROJECT_DIR not set');
      if (!command) throw new Error('AETHER_VOICE_SYNTHESIS_COMMAND not set');

      const payload = voiceCommandPayload(req, projectDir);
      const requestPath = requestPayloadPath(projectDir, req);
      await writeTextFile(requestPath, JSON.stringify(payload, null, 2));

      const commandOutput = await runCommand({
        command,
        args: [...args, requestPath],
        cwd: projectDir,
        requestPath,
      });
      const artifacts = await synthesizeArtifacts({
        req,
        projectDir,
        providerRef,
        output: commandOutput,
        fileExists,
      });

      return {
        providerId: id,
        artifacts,
        provenance: uniqueProvenance([providerRef, ...req.provenance]),
      };
    },
  };
}

async function synthesizeArtifacts(input: {
  req: VoiceSynthesisRequest;
  projectDir: string;
  providerRef: MotionProvenanceRef;
  output: VoiceCommandOutput | void;
  fileExists: VoiceFileExists;
}): Promise<VoiceArtifact[]> {
  const plannedById = new Map(input.req.expectedArtifacts.map((artifact) => [artifact.id, artifact]));

  if (input.output?.artifacts) {
    const outputById = new Map<string, VoiceCommandOutputArtifact>();
    for (const artifact of input.output.artifacts) {
      if (!plannedById.has(artifact.id)) {
        throw new Error(`voice command returned unplanned voice artifact ${artifact.id}`);
      }
      if (outputById.has(artifact.id)) {
        throw new Error(`voice command returned duplicate voice artifact ${artifact.id}`);
      }
      outputById.set(artifact.id, artifact);
    }

    return input.req.expectedArtifacts.map((planned) => {
      const artifact = outputById.get(planned.id);
      if (!artifact) {
        throw new Error(`voice command did not return planned voice artifact ${planned.id}`);
      }
      return hydrateArtifact({
        planned,
        projectDir: input.projectDir,
        providerRef: input.providerRef,
        output: artifact,
      });
    });
  }

  const artifacts: VoiceArtifact[] = [];
  for (const planned of input.req.expectedArtifacts) {
    const absolutePath = absoluteArtifactPath(input.projectDir, planned.path);
    if (!(await input.fileExists(absolutePath))) {
      throw new Error(`voice command did not produce ${absolutePath}`);
    }
    artifacts.push(
      hydrateArtifact({
        planned,
        projectDir: input.projectDir,
        providerRef: input.providerRef,
      })
    );
  }
  return artifacts;
}

function hydrateArtifact(input: {
  planned: VoiceArtifact;
  projectDir: string;
  providerRef: MotionProvenanceRef;
  output?: VoiceCommandOutputArtifact;
}): VoiceArtifact {
  const pathValue = input.output?.path ?? input.planned.path;
  return {
    ...input.planned,
    path: pathValue,
    assetUrl:
      input.output?.assetUrl ?? pathToFileURL(absoluteArtifactPath(input.projectDir, pathValue)).href,
    ...(input.output?.durationMs !== undefined ? { durationMs: input.output.durationMs } : {}),
    provenance: uniqueProvenance([
      input.providerRef,
      ...input.planned.provenance,
      ...(input.output?.provenance ?? []),
    ]),
  };
}

function voiceCommandPayload(
  req: VoiceSynthesisRequest,
  projectDir: string
): VoiceCommandPayload {
  return {
    id: req.id,
    projectId: req.projectId,
    draftId: req.draftId,
    clipId: req.clipId,
    ...(req.trackId ? { trackId: req.trackId } : {}),
    text: req.text,
    ...(req.voiceId ? { voiceId: req.voiceId } : {}),
    startFrame: req.startFrame,
    durationFrames: req.durationFrames,
    fps: req.fps,
    targetSeconds: req.durationFrames / req.fps,
    expectedArtifacts: req.expectedArtifacts.map((artifact) => ({
      ...artifact,
      absolutePath: absoluteArtifactPath(projectDir, artifact.path),
    })),
    provenance: req.provenance,
  };
}

function requestPayloadPath(projectDir: string, req: VoiceSynthesisRequest): string {
  return path.join(projectDir, '.aether', 'voice-requests', `${safePathSegment(req.id)}.json`);
}

function absoluteArtifactPath(projectDir: string, artifactPath: string): string {
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, artifactPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`voice artifact path escapes project directory: ${artifactPath}`);
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

function defaultRunCommand(call: VoiceCommandCall): Promise<VoiceCommandOutput | void> {
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
          resolve(JSON.parse(text) as VoiceCommandOutput);
        } catch {
          reject(new Error('voice command stdout must be JSON when non-empty'));
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
