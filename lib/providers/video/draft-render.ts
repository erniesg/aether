import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DRAFT_RENDER_PROVIDER_ID } from '@/lib/motion/repoVideoProviderIds';
import type { TimelineClip, TimelineTrack } from '@/lib/motion/project';
import type {
  MotionRenderOutput,
  MotionRenderProvider,
  MotionRenderRequest,
} from './types';

const execFileAsync = promisify(execFile);
const VISUAL_TRACK_KINDS = new Set<TimelineTrack['kind']>(['screen', 'broll', 'text']);

export interface CreateDraftMotionRenderProviderOptions {
  outputRoot?: string;
}

export function createDraftMotionRenderProvider(
  options: CreateDraftMotionRenderProviderOptions = {}
): MotionRenderProvider {
  return {
    id: DRAFT_RENDER_PROVIDER_ID,
    engine: 'remotion',
    displayName: 'Aether local draft render',
    available: () => true,
    async render(request) {
      const outputRoot =
        options.outputRoot ?? path.join(process.cwd(), 'outputs', 'motion-draft-renders');
      const providerRef = { kind: 'provider' as const, ref: DRAFT_RENDER_PROVIDER_ID };
      const outputPaths = new Map<string, string>();

      for (const output of request.outputs.filter((candidate) => candidate.kind === 'video')) {
        const outputPath = path.join(outputRoot, output.path);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await renderDraftVideo(request, output, outputPath);
        outputPaths.set(output.id, outputPath);
      }

      for (const output of request.outputs.filter((candidate) => candidate.kind !== 'video')) {
        const outputPath = path.join(outputRoot, output.path);
        await mkdir(path.dirname(outputPath), { recursive: true });
        if (output.kind === 'poster') {
          const video = request.outputs.find(
            (candidate) => candidate.kind === 'video' && candidate.exportId === output.exportId
          );
          const videoPath = video ? outputPaths.get(video.id) : undefined;
          if (videoPath) await renderDraftPoster(videoPath, outputPath);
          else await renderDraftStill(request, output, outputPath);
        } else {
          await writeDraftTextOutput(request, output, outputPath);
        }
        outputPaths.set(output.id, outputPath);
      }

      return {
        providerId: DRAFT_RENDER_PROVIDER_ID,
        engine: 'remotion',
        outputs: request.outputs.map((output) => ({
          ...output,
          assetUrl: options.outputRoot
            ? pathToFileURL(path.join(outputRoot, output.path)).href
            : `/api/motion/artifacts?path=${encodeURIComponent(output.path)}`,
          provenance: [providerRef, ...output.provenance],
        })),
        provenance: [providerRef, ...request.provenance],
      };
    },
  };
}

async function renderDraftVideo(
  request: MotionRenderRequest,
  output: MotionRenderOutput,
  outputPath: string
): Promise<void> {
  const seconds = Math.max(1, request.durationFrames / request.fps);
  const textFiles = await writeTimelineTextFiles(request, outputPath, output.width > output.height);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x0f0d0c:s=${output.width}x${output.height}:r=${request.fps}:d=${seconds}`,
        '-f',
        'lavfi',
        '-i',
        `anullsrc=channel_layout=stereo:sample_rate=48000:d=${seconds}`,
        '-vf',
        draftVideoFilter(request, output, textFiles),
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '30',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { cwd: path.dirname(outputPath) }
    );
  } finally {
    await Promise.all(textFiles.map((file) => rm(file.path, { force: true })));
  }
}

async function renderDraftPoster(videoPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    '0.5',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    outputPath,
  ]);
}

async function renderDraftStill(
  request: MotionRenderRequest,
  output: MotionRenderOutput,
  outputPath: string
): Promise<void> {
  const textFiles = await writeTimelineTextFiles(request, outputPath, output.width > output.height);
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x0f0d0c:s=${output.width}x${output.height}`,
        '-vf',
        draftVideoFilter(request, output, textFiles),
        '-frames:v',
        '1',
        outputPath,
      ],
      { cwd: path.dirname(outputPath) }
    );
  } finally {
    await Promise.all(textFiles.map((file) => rm(file.path, { force: true })));
  }
}

interface TimelineTextFile {
  kind: 'visual' | 'caption';
  clip: TimelineClip;
  path: string;
  fileName: string;
}

async function writeTimelineTextFiles(
  request: MotionRenderRequest,
  outputPath: string,
  landscape: boolean
): Promise<TimelineTextFile[]> {
  const visualClips = request.tracks
    .filter((track) => VISUAL_TRACK_KINDS.has(track.kind))
    .flatMap((track) => track.clips)
    .sort((left, right) => left.startFrame - right.startFrame);
  const captionClips = request.tracks
    .filter((track) => track.kind === 'caption')
    .flatMap((track) => track.clips)
    .sort((left, right) => left.startFrame - right.startFrame);
  const files = [
    ...visualClips.map((clip) => ({ kind: 'visual' as const, clip })),
    ...captionClips.map((clip) => ({ kind: 'caption' as const, clip })),
  ];
  const prefix = safeFilePart(path.basename(outputPath));

  return await Promise.all(
    files.map(async ({ kind, clip }, index) => {
      const fileName = `.${prefix}-${kind}-${index}.txt`;
      const filePath = path.join(path.dirname(outputPath), fileName);
      const maxCharacters = kind === 'caption' ? (landscape ? 64 : 36) : landscape ? 42 : 24;
      await writeFile(filePath, wrapTimelineText(clipText(clip), maxCharacters));
      return { kind, clip, path: filePath, fileName };
    })
  );
}

function draftVideoFilter(
  request: MotionRenderRequest,
  output: MotionRenderOutput,
  textFiles: TimelineTextFile[]
): string {
  const landscape = output.width > output.height;
  const margin = Math.round(output.width * (landscape ? 0.08 : 0.09));
  const cardY = Math.round(output.height * (landscape ? 0.18 : 0.2));
  const cardHeight = Math.round(output.height * (landscape ? 0.6 : 0.56));
  const fontSize = Math.round(output.width * (landscape ? 0.04 : 0.066));
  const captionFontSize = Math.round(output.width * (landscape ? 0.024 : 0.034));
  const filters = [
    'drawbox=x=0:y=0:w=iw:h=12:color=0xd87040:t=fill',
    `drawtext=text='AETHER  /  EDITABLE PR VIDEO':fontcolor=0xc0b6a6:fontsize=${Math.round(fontSize * 0.38)}:x=${margin}:y=${Math.round(output.height * 0.06)}`,
  ];

  for (const file of textFiles) {
    const start = file.clip.startFrame / request.fps;
    const end = (file.clip.startFrame + file.clip.durationFrames) / request.fps;
    const enabled = `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
    if (file.kind === 'visual') {
      filters.push(
        `drawbox=x=${margin}:y=${cardY}:w=${output.width - margin * 2}:h=${cardHeight}:color=0x181614@0.98:t=fill:${enabled}`,
        `drawbox=x=${margin}:y=${cardY}:w=${Math.round(output.width * 0.16)}:h=10:color=0x8ca2bc:t=fill:${enabled}`,
        `drawtext=textfile=${file.fileName}:fontcolor=0xf0e8da:fontsize=${fontSize}:line_spacing=${Math.round(fontSize * 0.18)}:x=${margin + Math.round(output.width * 0.045)}:y=(h-text_h)/2:${enabled}`
      );
    } else {
      filters.push(
        `drawtext=textfile=${file.fileName}:fontcolor=0x0f0d0c:fontsize=${captionFontSize}:line_spacing=${Math.round(captionFontSize * 0.15)}:box=1:boxcolor=0xf0e8da@0.94:boxborderw=${Math.round(captionFontSize * 0.55)}:x=(w-text_w)/2:y=${Math.round(output.height * 0.84)}:${enabled}`
      );
    }
  }

  const fadeOutStart = Math.max(0, request.durationFrames / request.fps - 0.25);
  filters.push(`fade=t=in:st=0:d=0.2`, `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.25`);
  return filters.join(',');
}

async function writeDraftTextOutput(
  request: MotionRenderRequest,
  output: MotionRenderOutput,
  outputPath: string
): Promise<void> {
  if (output.kind === 'subtitle') {
    await writeFile(outputPath, draftWebVtt(request));
    return;
  }
  if (output.kind === 'transcript') {
    await writeFile(outputPath, draftTranscript(request));
    return;
  }
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        requestId: request.id,
        projectId: request.projectId,
        draftId: request.draftId,
        providerId: DRAFT_RENDER_PROVIDER_ID,
        outputId: output.id,
        kind: output.kind,
        sceneCount: visualClips(request).length,
        note: 'Editable local draft rendered from the current MotionProject timeline.',
      },
      null,
      2
    )
  );
}

function draftWebVtt(request: MotionRenderRequest): string {
  const captions = request.tracks
    .filter((track) => track.kind === 'caption')
    .flatMap((track) => track.clips)
    .sort((left, right) => left.startFrame - right.startFrame);
  return [
    'WEBVTT',
    '',
    ...captions.map((clip, index) => {
      const start = clip.startFrame / request.fps;
      const end = (clip.startFrame + clip.durationFrames) / request.fps;
      return `${index + 1}\n${formatVttTime(start)} --> ${formatVttTime(end)}\n${clipText(clip)}\n`;
    }),
  ].join('\n');
}

function draftTranscript(request: MotionRenderRequest): string {
  const voiceLines = request.tracks
    .filter((track) => track.kind === 'voice')
    .flatMap((track) => track.clips)
    .sort((left, right) => left.startFrame - right.startFrame)
    .map(clipText)
    .filter(Boolean);
  return (voiceLines.length > 0 ? voiceLines : visualClips(request).map(clipText)).join('\n');
}

function visualClips(request: MotionRenderRequest): TimelineClip[] {
  return request.tracks
    .filter((track) => VISUAL_TRACK_KINDS.has(track.kind))
    .flatMap((track) => track.clips)
    .sort((left, right) => left.startFrame - right.startFrame);
}

function clipText(clip: TimelineClip): string {
  const value =
    clip.props.caption ??
    clip.props.headline ??
    clip.props.text ??
    clip.props.narration ??
    clip.props.command;
  return typeof value === 'string' && value.trim() ? value.trim() : clip.componentId ?? clip.id;
}

function wrapTimelineText(text: string, maxCharacters: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 7).join('\n');
}

function formatVttTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
}
