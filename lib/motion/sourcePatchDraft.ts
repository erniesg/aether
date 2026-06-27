import type { MotionRenderEngine } from '@/lib/providers/video/types';
import type { MotionProject } from './project';
import { buildMotionRenderRequest } from './renderExecution';
import { buildMotionRenderPlan } from './renderPlan';
import type {
  MotionRegenerationSourcePatchInstruction,
  MotionRegenerationSourcePatchPlan,
} from './reviewPlan';
import type { MotionSourceBundleEditFile } from './sourceBundleApply';

export interface BuildMotionSourcePatchDraftOptions {
  engine?: MotionRenderEngine;
  fps?: number;
  requestedAt: number;
}

export interface MotionSourcePatchDraftRequestTemplate {
  project: '$motionProject';
  id: string;
  files: '$draftSourceFiles';
  requestedEngines: '$selectedEngines';
  requestedAt: '$now';
}

export type MotionSourcePatchDraft =
  | {
      id: string;
      status: 'ready';
      route: '/api/motion/source-edit';
      method: 'POST';
      sourceEditId: string;
      sourcePatchPlanId: string;
      files: MotionSourceBundleEditFile[];
      targetClipIds: string[];
      requestTemplate: MotionSourcePatchDraftRequestTemplate;
      blockers: [];
    }
  | {
      id: string;
      status: 'blocked';
      route: '/api/motion/source-edit';
      method: 'POST';
      sourceEditId: string;
      sourcePatchPlanId: string;
      files: [];
      targetClipIds: [];
      requestTemplate: MotionSourcePatchDraftRequestTemplate;
      blockers: string[];
    };

interface TargetClipPatch {
  clipId: string;
  instruction: MotionRegenerationSourcePatchInstruction;
}

export function buildMotionSourcePatchDraft(
  project: MotionProject,
  sourcePatchPlan: MotionRegenerationSourcePatchPlan,
  options: BuildMotionSourcePatchDraftOptions
): MotionSourcePatchDraft {
  const draftId = project.currentDraftId;
  const renderPlan = buildMotionRenderPlan(project, {
    engine: options.engine ?? 'remotion',
    draftId,
    fps: options.fps,
    requestedAt: options.requestedAt,
  });
  const requestTemplate = sourceEditRequestTemplate(sourcePatchPlan);

  if (renderPlan.status !== 'ready') {
    return blockedDraft(sourcePatchPlan, requestTemplate, renderPlan.blockers.map((blocker) => blocker.label));
  }

  const request = buildMotionRenderRequest(project, renderPlan);
  const sourceFiles = request.sourceFiles ?? [];
  const targetPaths = sourcePatchPlan.targetFiles.map((file) => file.path);
  const targetClipPatches: TargetClipPatch[] = [];

  const files = targetPaths.flatMap((path): MotionSourceBundleEditFile[] => {
    const file = sourceFiles.find((candidate) => candidate.path === path);
    if (!file) return [];

    if (path.startsWith('timeline/') && path.endsWith('.json')) {
      const edited = editTimelineSource(file.contents, sourcePatchPlan, options.requestedAt);
      targetClipPatches.push(...edited.targetClipPatches);
      return [{ path, contents: edited.contents }];
    }

    if (path === 'STORYBOARD.md') {
      return [{ path, contents: editSectionNoteSource(file.contents, targetClipPatches) }];
    }

    if (path === 'EDIT.md') {
      return [{ path, contents: editSectionNoteSource(file.contents, targetClipPatches) }];
    }

    return [{ path, contents: file.contents }];
  });

  const targetClipIds = uniqueStrings(targetClipPatches.map((patch) => patch.clipId));
  if (files.length === 0 || targetClipIds.length === 0) {
    return blockedDraft(sourcePatchPlan, requestTemplate, [
      'No editable source clips matched the source patch plan.',
    ]);
  }

  return {
    id: `source-patch-draft-${sourcePatchPlan.id}`,
    status: 'ready',
    route: '/api/motion/source-edit',
    method: 'POST',
    sourceEditId: sourcePatchPlan.sourceEditId,
    sourcePatchPlanId: sourcePatchPlan.id,
    files,
    targetClipIds,
    requestTemplate,
    blockers: [],
  };
}

function editTimelineSource(
  contents: string,
  sourcePatchPlan: MotionRegenerationSourcePatchPlan,
  requestedAt: number
): { contents: string; targetClipPatches: TargetClipPatch[] } {
  const timeline = JSON.parse(contents) as {
    tracks?: Array<{
      id?: string;
      clips?: Array<{
        id?: string;
        componentId?: string;
        props?: Record<string, unknown>;
      }>;
    }>;
  };
  const targetClipPatches: TargetClipPatch[] = [];

  for (const track of timeline.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      if (!clip.id || !clip.componentId) continue;
      const instruction = sourcePatchPlan.instructions.find((candidate) =>
        candidate.componentIds.includes(clip.componentId ?? '')
      );
      if (!instruction) continue;

      clip.props = {
        ...(clip.props ?? {}),
        sourcePatchDraft: {
          planId: sourcePatchPlan.id,
          sourceEditId: sourcePatchPlan.sourceEditId,
          instructionId: instruction.id,
          scope: instruction.scope,
          label: instruction.label,
          prompt: instruction.prompt,
          componentIds: [...instruction.componentIds],
          componentLabels: [...instruction.componentLabels],
          targetPaths: [...instruction.targetPaths],
          operationKinds: [...instruction.operationKinds],
          guidanceRefs: [...instruction.guidanceRefs],
          requestedAt,
        },
      };
      targetClipPatches.push({ clipId: clip.id, instruction });
    }
  }

  return {
    contents: JSON.stringify(timeline, null, 2),
    targetClipPatches,
  };
}

function editSectionNoteSource(contents: string, patches: TargetClipPatch[]): string {
  let next = contents;
  for (const patch of patches) {
    next = upsertSectionSourcePatchNote(
      next,
      patch.clipId,
      `Source patch: ${patch.instruction.label}`
    );
  }
  return next;
}

function upsertSectionSourcePatchNote(contents: string, clipId: string, note: string): string {
  const headingIndex = contents.indexOf(`## ${clipId}\n`);
  const clipLineIndex = contents.indexOf(`Clip: ${clipId}\n`);
  const start = headingIndex === -1 ? clipLineIndex : headingIndex;
  if (start === -1) return contents;

  const nextHeading = contents.indexOf('\n## ', start + 1);
  const end = nextHeading === -1 ? contents.length : nextHeading + 1;
  const section = contents.slice(start, end);
  if (section.includes(`${note}\n`)) return contents;

  const sourcePatchLine = /^Source patch:.*$/m;
  const updatedSection = sourcePatchLine.test(section)
    ? section.replace(sourcePatchLine, note)
    : insertNoteBeforeSectionBreak(section, note);
  return contents.slice(0, start) + updatedSection + contents.slice(end);
}

function insertNoteBeforeSectionBreak(section: string, note: string): string {
  const trailingBlank = section.endsWith('\n\n') ? '\n' : '';
  const body = trailingBlank ? section.slice(0, -1) : section;
  return `${body}${body.endsWith('\n') ? '' : '\n'}${note}\n${trailingBlank}`;
}

function sourceEditRequestTemplate(
  sourcePatchPlan: MotionRegenerationSourcePatchPlan
): MotionSourcePatchDraftRequestTemplate {
  return {
    project: '$motionProject',
    id: sourcePatchPlan.sourceEditId,
    files: '$draftSourceFiles',
    requestedEngines: '$selectedEngines',
    requestedAt: '$now',
  };
}

function blockedDraft(
  sourcePatchPlan: MotionRegenerationSourcePatchPlan,
  requestTemplate: MotionSourcePatchDraftRequestTemplate,
  blockers: string[]
): MotionSourcePatchDraft {
  return {
    id: `source-patch-draft-${sourcePatchPlan.id}`,
    status: 'blocked',
    route: '/api/motion/source-edit',
    method: 'POST',
    sourceEditId: sourcePatchPlan.sourceEditId,
    sourcePatchPlanId: sourcePatchPlan.id,
    files: [],
    targetClipIds: [],
    requestTemplate,
    blockers,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
