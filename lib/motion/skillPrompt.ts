import type { AgentMotionStartResult } from './start';

export function buildMotionSkillAuthoringPrompt(result: AgentMotionStartResult): string {
  const workflow = result.workflow.plan;
  const project = result.project;
  const previewPlan = result.previewPlan;
  const contract = workflow.skillContract;
  const appName = project?.brief.appProfile.name ?? previewPlan?.summary.appName ?? 'an app';
  const projectKind = project?.brief.projectKind ?? previewPlan?.summary.projectKind ?? 'video';
  const targets =
    project?.brief.platformTargets.map(
      (target) => `${target.platform} ${target.aspectRatio} ${target.seconds}s`
    ) ??
    previewPlan?.summary.targetPlatforms ??
    [];
  const storyRoles = uniqueStrings([
    ...(project?.story.map((beat) => beat.role) ?? []),
    ...(previewPlan?.storyboard.map((beat) => beat.role) ?? []),
  ]);
  const components = uniqueStrings(
    previewPlan?.editableComponents.map((component) => component.componentLabel) ?? []
  );
  const graphKinds = uniqueStrings(project?.graphNodes.map((node) => node.kind) ?? []);
  const regenerationTargets = contract?.regenerationTargets ?? [];
  const reviewArtifacts = contract?.reviewArtifacts ?? [];
  const verificationArtifacts = contract?.verificationArtifacts ?? [];

  return [
    `Write a reusable aether motion skill for "${workflow.label}".`,
    '',
    'Context:',
    `- App: ${appName}`,
    `- Video kind: ${projectKind}`,
    `- Workflow id: ${workflow.workflowId}`,
    `- Run modes: ${(contract?.runModes ?? [workflow.mode]).join(', ')}`,
    `- Sources: ${workflow.acceptedSources.map((source) => `${source.kind}:${source.ref}`).join(', ') || workflow.sourceStatus}`,
    `- Targets: ${targets.join(', ') || 'creator-selected social formats'}`,
    `- Engines: ${workflow.engines.join(', ')}`,
    `- Story roles: ${storyRoles.join(', ') || 'hook, proof, demo, payoff, cta'}`,
    `- Editable components: ${components.join(', ') || 'script, captures, captions, timing, effects'}`,
    `- Graph nodes: ${graphKinds.join(', ') || 'script, storyboard, capture, voice, sync, render'}`,
    '',
    [
      'The skill must be agent-native and provider-agnostic.',
      'It should accept a repo, PR, site, or local path plus a brief and output targets,',
      'then plan and execute an editable motion workflow:',
    ].join(' '),
    '- inspect repo/product facts and write a script with cited claims',
    '- generate draft variations for review or continue full-auto when requested',
    '- gather/find/generate visuals, capture app screens, and plan image-to-video inserts',
    '- generate or request voiceover, captions, word timings, effects, audio cues, and transitions',
    '- assemble a timeline compatible with HyperFrames and Remotion',
    '- expose regeneration targets for individual story beats, components, captures, captions, voice lines, timing, effects, and the whole video',
    '- render proof artifacts and export a provenance-rich pack for social formats',
    '- keep creator review artifacts visible before committing expensive provider calls',
    '',
    `Review artifacts to produce: ${reviewArtifacts.join(', ') || 'video-plan, draft-variations, timeline, render-proof, export-pack'}.`,
    `Regeneration targets: ${regenerationTargets.join(', ') || 'story-beat, component, timing, effect, whole-video'}.`,
    `Verification artifacts: ${verificationArtifacts.join(', ') || 'contact-sheet, mp4-probe, poster, subtitles, transcript, provenance-manifest'}.`,
    '',
    [
      'The SKILL.md instructions should include a clear input shape, step-by-step workflow,',
      'review vs full-auto behavior, output JSON contract, and explicit guardrails for',
      'visual identity, timing/sync, provenance, and provider selection.',
    ].join(' '),
    'Do not hardcode a default image, voice, video, Remotion, HyperFrames, or hosting provider.',
  ].join('\n');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
