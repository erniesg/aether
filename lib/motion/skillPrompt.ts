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
  const sourceInputContract = buildSourceInputContract(workflow.workflowId);
  const outputContract = buildOutputContract(workflow.mode);

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
    'Runtime input contract the SKILL.md must document:',
    sourceInputContract,
    '',
    'Output JSON contract the SKILL.md must document:',
    outputContract,
    '',
    'Aether handoff contract:',
    '- When the skill can start a project directly, produce a `motionStartRequest` object compatible with POST /api/motion/start.',
    '- For repo, site, and local-path starts, include one of `repoUrl`, `repoPath`, `siteUrl`, or `sourceRefs`.',
    '- For PR-to-video starts, include `prRef`; when code-change evidence was already collected, also include `appProfile`, `codeChangeSource`, and `codeChange`.',
    '- The `codeChange` payload must include providerId, title, files, hunks, commits, reviews, ci, and provenance so Aether can create an editable PR video without a separate provider.',
    '- If evidence is missing, return a review artifact that asks the agent to collect exactly the missing source or code-change evidence instead of inventing claims.',
    '',
    [
      'The SKILL.md instructions should include a clear input shape, step-by-step workflow,',
      'review vs full-auto behavior, output JSON contract, and explicit guardrails for',
      'visual identity, timing/sync, provenance, and provider selection.',
    ].join(' '),
    'Do not hardcode a default image, voice, video, Remotion, HyperFrames, or hosting provider.',
  ].join('\n');
}

function buildSourceInputContract(workflowId: string): string {
  const base = [
    '```json',
    '{',
    '  "mode": "review | full-auto",',
    '  "sourceRefs": [{ "kind": "repo | pr | site | capture | upload | reference", "ref": "..." }],',
    '  "repoPath": "/absolute/local/repo/path",',
    '  "repoUrl": "https://github.com/owner/repo",',
    '  "siteUrl": "https://app.example.com/route",',
    '  "prRef": "owner/repo#123 or https://github.com/owner/repo/pull/123",',
    '  "audience": "who this video is for",',
    '  "tone": "motion and copy tone",',
    '  "platformTargets": [{ "platform": "x | linkedin | youtube | tiktok | instagram | website | deck", "aspectRatio": "16:9 | 9:16 | 1:1 | 4:5", "seconds": 30 }],',
    '  "requestedEngines": ["remotion", "hyperframes", "provider"],',
    '  "visualReferences": ["selected reference ids or urls"],',
    '  "capturePreferences": { "needsScreenshot": true, "needsRecording": false }',
    '}',
    '```',
  ];

  if (workflowId !== 'pr-to-video') return base.join('\n');

  return [
    ...base,
    '',
    'For PR-to-video, also accept agent-collected evidence:',
    '```json',
    '{',
    '  "appProfile": { "name": "app name", "repoUrl": "https://github.com/owner/repo", "summary": "grounded app summary", "stack": ["TypeScript"] },',
    '  "codeChangeSource": { "kind": "github-pr | local-diff | commit-range", "ref": "owner/repo#123" },',
    '  "codeChange": {',
    '    "providerId": "agent-collected-pr",',
    '    "title": "human-readable PR title",',
    '    "author": { "name": "author name" },',
    '    "files": [{ "path": "file.ts", "status": "added | modified | removed | renamed", "additions": 12, "deletions": 3, "language": "TypeScript" }],',
    '    "hunks": [{ "id": "stable-hunk-id", "filePath": "file.ts", "newStart": 10, "lines": ["+changed line"], "provenance": [{ "kind": "code-change", "ref": "diff:file.ts#10" }] }],',
    '    "commits": [{ "sha": "abc123", "message": "commit subject" }],',
    '    "reviews": [{ "reviewer": "name", "state": "approved | changes-requested | commented" }],',
    '    "ci": [{ "name": "typecheck", "status": "passed | failed | pending | unknown" }],',
    '    "provenance": [{ "kind": "code-change", "ref": "github:owner/repo#123" }]',
    '  }',
    '}',
    '```',
  ].join('\n');
}

function buildOutputContract(mode: string): string {
  return [
    '```json',
    '{',
    '  "ok": true,',
    '  "result": {',
    '    "mode": "review | full-auto",',
    '    "status": "ready | needs-source | needs-evidence | blocked",',
    '    "motionStartRequest": { "workspaceId": "workspace", "sourceRefs": [], "platformTargets": [] },',
    '    "videoPlan": { "title": "video title", "beats": [{ "role": "hook", "narration": "..." }] },',
    '    "draftOptions": [{ "label": "Primary cut", "angle": "..." }],',
    '    "reviewArtifacts": [{ "kind": "video-plan | draft-variations | sync-plan | render-proof | export-pack", "label": "..." }],',
    '    "regenerationActions": [{ "target": "story-beat | component | capture | code-proof | caption | voice-line | timing | effect | whole-video", "label": "..." }],',
    '    "verification": { "required": ["contact-sheet", "mp4-probe", "poster", "subtitles", "transcript", "provenance-manifest"] },',
    '    "provenance": [{ "kind": "repo | code-change | site | reference | manual", "ref": "..." }],',
    `    "nextAction": "${mode === 'full-auto' ? 'continue-through-saved-gates' : 'show-review-artifacts'}"`,
    '  }',
    '}',
    '```',
  ].join('\n');
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
