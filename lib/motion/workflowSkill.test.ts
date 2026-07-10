import { describe, expect, it } from 'vitest';
import { buildAgentMotionWorkflowPlan, type MotionWorkflowPlanSourceRef } from './workflowPlan';

const prSource: MotionWorkflowPlanSourceRef = {
  kind: 'pr',
  ref: 'erniesg/aether#456',
  label: 'Aether PR #456',
};

describe('motion workflow skill drafts', () => {
  it('turns a PR-to-video run plan into a reusable SKILL.md manifest', () => {
    const plan = buildAgentMotionWorkflowPlan({
      workflowId: 'pr-to-video',
      mode: 'full-auto',
      sourceRefs: [prSource],
      requestedEngines: ['hyperframes'],
      createdAt: 200,
    });

    expect(plan.skillDraft).toMatchObject({
      kind: 'motion-workflow-skill-draft',
      label: 'PR to video',
      manifestPathRelative: 'lib/agent/skills/pr-to-video/SKILL.md',
      startShorthands: ['repoPath', 'repoUrl', 'prRef', 'sourceRefs'],
      reviewPolicyLabels: expect.arrayContaining([
        'Auto-advance video plan after saving artifacts',
        'Auto-advance render proof after saving artifacts',
      ]),
      toolNames: [
        'motion_start',
        'motion_agent_handoff',
        'motion_regenerate',
        'motion_visuals',
        'motion_voice',
        'motion_sync',
        'motion_revise',
        'motion_preview_source',
        'motion_source_author',
        'motion_source_edit',
        'motion_render',
        'motion_export_pack',
      ],
      verificationLabels: [
        'contact sheet',
        'mp4 probe',
        'poster',
        'subtitles',
        'transcript',
        'provenance manifest',
      ],
      agentTaskLabels: expect.arrayContaining([
        'Collect PR title, summary, changed files, hunks, commits, reviews, and CI status at author time',
      ]),
      draftVariationLabels: [
        'Daily skill launch',
        'Maintainer brief',
        'Mechanism-first cut',
      ],
      componentSlotLabels: expect.arrayContaining([
        'Hook card',
        'Code diff card',
        'Code highlight card',
        'Code scroll card',
        'Code typing card',
        'Mechanism diagram',
        'Evidence card',
        'CTA card',
      ]),
      referencePatternLabels: [
        'Code diff explainer',
        'Proof receipt card',
        'Terminal command proof',
        'Voice and caption sync',
        'Multi-format export pack',
      ],
      skillPackLabels: ['HyperFrames workflow skills', 'iart data animation skills'],
      skillPackRequirements: [
        expect.objectContaining({
          id: 'hyperframes-workflow-skills',
          installCommand: 'npx skills add heygen-com/hyperframes',
        }),
        expect.objectContaining({
          id: 'iart-data-animation-skills',
          installCommand: 'npx skills add iart-ai/data-animation-skills',
        }),
      ],
      regenerationLabels: expect.arrayContaining([
        'code proof',
        'Code diff card: code',
        'Mechanism diagram: diagram',
      ]),
      timelineContract: {
        kind: 'motion-workflow-timeline-contract',
        primitive: 'timeline-and-node-graph',
        laneLabels: ['code change', 'visual search', 'voice', 'sync', 'render', 'export'],
        editableObjectLabels: expect.arrayContaining([
          'Code diff card',
          'voice lines',
          'caption clips',
          'effect presets',
          'render source files',
        ]),
        syncCueLabels: [
          'beat markers',
          'caption links',
          'voice clips',
          'word timings',
          'transition cues',
          'audio cues',
          'effect cues',
        ],
        nodeOutputLabels: expect.arrayContaining(['code change', 'effect markers']),
        sourceEditRouteLabels: [
          '/api/motion/preview-source',
          '/api/motion/source-author',
          '/api/motion/source-edit',
        ],
        reviewGateLabels: [],
      },
      launchKit: {
        kind: 'motion-workflow-launch-kit',
        label: 'PR to video launch kit',
        primaryFormat: 'x 9:16 30s',
        installCommand: 'npx skills add heygen-com/hyperframes',
        postLines: [
          "This week we're launching new skills for HyperFrames, each built around a workflow.",
          'Today is pr-to-video.',
          'Nobody reads pull requests. Now agents can turn them into a short explainer video.',
          'npx skills add heygen-com/hyperframes',
          'New skill launching every day. Follow for more.',
        ],
        platformTargets: ['x 9:16 30s', 'linkedin 4:5 45s'],
        componentSlotLabels: expect.arrayContaining([
          'Hook card',
          'Code diff card',
          'Code highlight card',
          'Code scroll card',
          'Code typing card',
          'Mechanism diagram',
          'Evidence card',
          'CTA card',
        ]),
        reviewArtifactLabels: [
          'Video plan',
          'Draft variations',
          'Component plan',
          'Sync plan',
          'Render proof',
        ],
        editSurfaceLabels: [
          'script',
          'code evidence',
          'component',
          'voice',
          'timing',
          'effect',
          'export',
        ],
        reviewObjects: expect.arrayContaining([
          expect.objectContaining({
            id: 'source-evidence-0',
            kind: 'source-evidence',
            label: 'Aether PR #456',
            sourceRef: 'erniesg/aether#456',
            artifactLabels: expect.arrayContaining([
              'PR metadata',
              'Changed files',
              'Diff hunks',
              'Reviews',
              'CI status',
            ]),
          }),
          expect.objectContaining({
            id: 'draft-pr-launch-note',
            kind: 'draft-variation',
            label: 'Daily skill launch',
            artifactLabels: ['hook', 'change', 'diff', 'proof', 'cta'],
          }),
          expect.objectContaining({
            id: 'regen-code-diff-card',
            kind: 'component-regeneration',
            label: 'Regenerate Code diff card',
            componentId: 'code-diff-card',
            regenerationScopes: ['code', 'proof', 'timing'],
          }),
          expect.objectContaining({
            id: 'timeline-contract',
            kind: 'timeline-contract',
            label: 'Timeline sync and source edits',
            artifactLabels: [
              'Beat markers',
              'Caption links',
              'Transition cues',
              'Audio cues',
              'Effect cues',
              'Edited source files',
            ],
          }),
          expect.objectContaining({
            id: 'teaser-x-9-16-30s',
            kind: 'teaser-target',
            label: 'x 9:16 30s',
          }),
          expect.objectContaining({
            id: 'export-x-9-16-30s',
            kind: 'export-pack',
            label: 'x 9:16 30s export pack',
            artifactLabels: ['MP4', 'Poster', 'Subtitles', 'Transcript', 'Manifest'],
          }),
        ]),
      },
      recipe: expect.objectContaining({
        slug: 'pr-to-video',
        generationLanes: ['code-change', 'visual-search', 'voice', 'sync', 'render', 'export'],
        referencePatterns: [
          expect.objectContaining({
            id: 'code-diff-explainer',
            componentIds: [
              'code-diff-card',
              'code-highlight-card',
              'code-scroll-card',
              'code-typing-card',
              'mechanism-diagram',
              'evidence-card',
            ],
          }),
          expect.objectContaining({
            id: 'proof-receipt-card',
          }),
          expect.objectContaining({
            id: 'terminal-command-proof',
          }),
          expect.objectContaining({
            id: 'voice-caption-sync',
          }),
          expect.objectContaining({
            id: 'multi-format-pack',
          }),
        ],
      }),
    });
    expect(plan.skillDraft.manifest).toMatchObject({
      name: 'pr-to-video',
      version: 1,
      description: 'PR to video skill for editable, provenance-rich motion videos.',
      tools: [
        'motion_start',
        'motion_agent_handoff',
        'motion_regenerate',
        'motion_visuals',
        'motion_voice',
        'motion_sync',
        'motion_revise',
        'motion_preview_source',
        'motion_source_author',
        'motion_source_edit',
        'motion_render',
        'motion_export_pack',
      ],
      referenceFiles: [],
    });
    expect(plan.skillDraft.sampleCopyLines).toContain(
      'npx skills add heygen-com/hyperframes'
    );
    expect(plan.skillDraft.manifest.instructions).toContain('## Input shape');
    expect(plan.skillDraft.manifest.instructions).toContain('/api/motion/agent-handoff');
    expect(plan.skillDraft.manifest.instructions).toContain('agentHandoff');
    expect(plan.skillDraft.manifest.instructions).toContain('## Agent Tasks');
    expect(plan.skillDraft.manifest.instructions).toContain('## Draft Variations');
    expect(plan.skillDraft.manifest.instructions).toContain('Daily skill launch');
    expect(plan.skillDraft.manifest.instructions).toContain('## Launch Kit');
    expect(plan.skillDraft.manifest.instructions).toContain('## Timeline Contract');
    expect(plan.skillDraft.manifest.instructions).toContain('timeline-and-node-graph');
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Sync cues: beat markers, caption links, voice clips, word timings, transition cues, audio cues, effect cues'
    );
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Source edit routes: /api/motion/preview-source, /api/motion/source-author, /api/motion/source-edit'
    );
    expect(plan.skillDraft.manifest.instructions).toContain('## Skill Packs');
    expect(plan.skillDraft.manifest.instructions).toContain('HyperFrames workflow skills');
    expect(plan.skillDraft.manifest.instructions).toContain('npx skills add heygen-com/hyperframes');
    expect(plan.skillDraft.manifest.instructions).toContain('iart data animation skills');
    expect(plan.skillDraft.manifest.instructions).toContain('npx skills add iart-ai/data-animation-skills');
    expect(plan.skillDraft.manifest.instructions).toContain('## Launch Kit Review Objects');
    expect(plan.skillDraft.manifest.instructions).toContain('Aether PR #456');
    expect(plan.skillDraft.manifest.instructions).toContain('Regenerate Code diff card');
    expect(plan.skillDraft.manifest.instructions).toContain('Timeline sync and source edits');
    expect(plan.skillDraft.manifest.instructions).toContain('x 9:16 30s export pack');
    expect(plan.skillDraft.manifest.instructions).toContain('x 9:16 30s');
    expect(plan.skillDraft.manifest.instructions).toContain('Today is pr-to-video.');
    expect(plan.skillDraft.manifest.instructions).toContain('## Component Regeneration');
    expect(plan.skillDraft.manifest.instructions).toContain('Code diff card');
    expect(plan.skillDraft.manifest.instructions).toContain('Regenerate: code, proof, timing');
    expect(plan.skillDraft.manifest.instructions).toContain('## Reference Patterns');
    expect(plan.skillDraft.manifest.instructions).toContain('Code diff explainer');
    expect(plan.skillDraft.manifest.instructions).toContain('Verify: diff is readable');
    expect(plan.skillDraft.manifest.instructions).toContain('/api/motion/render');
    expect(plan.skillDraft.manifest.instructions).toContain('## Output format');
    expect(plan.skillDraft.manifest.instructions).toContain('"timelineContract"');
    expect(plan.skillDraft.manifest.instructions).toContain('provenance manifest');
    expect(plan.skillDraft.manifest.instructions).toContain(
      'npx skills add heygen-com/hyperframes'
    );
  });

  it('keeps review-mode launch skills gated for creator review', () => {
    const plan = buildAgentMotionWorkflowPlan({
      workflowId: 'repo-launch-video',
      mode: 'review',
      sourceRefs: [
        {
          kind: 'repo',
          ref: '/Users/erniesg/code/erniesg/tong',
          label: 'Tong repo',
        },
      ],
      createdAt: 201,
    });

    expect(plan.skillDraft.startShorthands).toEqual([
      'repoPath',
      'repoUrl',
      'siteUrl',
      'sourceRefs',
    ]);
    expect(plan.skillDraft.reviewPolicyLabels).toContain(
      'Review video plan before continuing'
    );
    expect(plan.skillDraft.draftVariationLabels).toEqual([
      'Proof-first launch',
      'Demo-first launch',
      'Founder-note launch',
    ]);
    expect(plan.skillDraft.componentSlotLabels).toEqual(expect.arrayContaining([
      'Hook card',
      'Proof card',
      'App frame',
      'Agent trace',
      'CTA card',
    ]));
    expect(plan.skillDraft.referencePatternLabels).toEqual([
      'Launch hook title',
      'Real product capture',
      'Screen zoom callout',
      'Proof receipt card',
      'Agent process trace',
      'Skill drop announcement',
      'Terminal command proof',
      'Computer-use capture loop',
      'Image-to-video insert',
      'Prompt-to-artifact demo',
      'Voice and caption sync',
      'Multi-format export pack',
      'Branded template system',
      'Localized voice caption variants',
      'Reviewable draft board',
    ]);
    expect(plan.skillDraft.skillPackLabels).toEqual([
      'HyperFrames workflow skills',
      'iart motion-design skills',
    ]);
    expect(plan.skillDraft.skillPackRequirements).toEqual([
      expect.objectContaining({
        id: 'hyperframes-workflow-skills',
        installCommand: 'npx skills add heygen-com/hyperframes',
      }),
      expect.objectContaining({
        id: 'iart-motion-design-skills',
        installCommand: 'npx skills add iart-ai/motion-design-skills',
        verificationLabels: ['seek-shot.sh', 'contact-sheet.sh', 'probe-mp4.sh'],
      }),
    ]);
    expect(plan.skillDraft.toolNames).toContain('motion_capture');
    expect(plan.skillDraft.timelineContract).toMatchObject({
      primitive: 'timeline-and-node-graph',
      laneLabels: [
        'repo facts',
        'capture',
        'visual search',
        'image to video',
        'voice',
        'sync',
        'render',
        'export',
      ],
      editableObjectLabels: expect.arrayContaining([
        'app captures',
        'cursor paths',
        'image-to-video inserts',
        'voice lines',
        'caption clips',
        'effect presets',
        'render source files',
      ]),
      syncCueLabels: expect.arrayContaining(['audio cues', 'effect cues']),
      sourceEditRouteLabels: [
        '/api/motion/preview-source',
        '/api/motion/source-author',
        '/api/motion/source-edit',
      ],
      reviewGateLabels: [
        'Video plan',
        'Draft variations',
        'Product capture',
        'Visual sources',
        'Voice and captions',
        'Timeline sync',
        'Render proof',
        'Export pack',
      ],
    });
    expect(plan.skillDraft.sourcePackageContract).toMatchObject({
      kind: 'motion-workflow-source-package-contract',
      engineLabels: ['Remotion source package', 'HyperFrames source package'],
      editableFileLabels: [
        'DESIGN.md',
        'SCRIPT.md',
        'STORYBOARD.md',
        'timeline JSON',
        'EDIT.md',
        'engine entrypoint',
        'source manifest',
      ],
      setupCommandLabels: expect.arrayContaining([
        'Install Remotion render dependencies',
        'Check HyperFrames render environment',
      ]),
      verificationReceiptLabels: expect.arrayContaining([
        'Preview source files',
        'Runtime mount target',
        'Edit contract',
        'Source package setup',
        'Render source manifest',
      ]),
      routeLabels: [
        '/api/motion/preview-source',
        '/api/motion/source-author',
        '/api/motion/source-edit',
        '/api/motion/render',
      ],
    });
    expect(plan.skillDraft.reviewLoopContract).toMatchObject({
      kind: 'motion-workflow-review-loop-contract',
      modeLabels: ['Review gates', 'Full auto'],
      creatorDecisionLabels: expect.arrayContaining([
        'Review video plan',
        'Choose draft variation',
        'Regenerate component',
        'Switch to full auto',
        'Render proof',
        'Export pack',
      ]),
      reviewArtifactLabels: expect.arrayContaining([
        'Video plan',
        'Draft variations',
        'Component plan',
        'Capture plan',
        'Render proof',
      ]),
      draftBoardLabels: [
        'Proof-first launch',
        'Demo-first launch',
        'Founder-note launch',
      ],
      regenerationActionLabels: expect.arrayContaining([
        'Regenerate App frame',
        'Regenerate Hook card',
        'App frame: capture',
      ]),
      routeLabels: [
        '/api/motion/start',
        '/api/motion/regenerate',
        '/api/motion/revise',
        '/api/motion/mode',
        '/api/motion/agent-handoff',
        '/api/motion/full-auto',
      ],
      expectedReceiptLabels: expect.arrayContaining([
        'video plan receipt',
        'draft selection receipt',
        'regeneration request',
        'updated preview plan',
        'render proof receipt',
      ]),
    });
    expect(plan.skillDraft.captureContract).toMatchObject({
      kind: 'motion-workflow-capture-contract',
      required: true,
      targetLabels: [
        'repoPath local app',
        'repoUrl hosted app',
        'siteUrl route',
        'uploaded capture',
      ],
      captureModeLabels: [
        'screenshot',
        'DOM snapshot',
        'interaction trace',
        'screen recording',
      ],
      toolLabels: [
        'app launch',
        'browser capture',
        'screen recording',
        'computer-use fallback',
      ],
      routeLabels: [
        '/api/motion/capture',
        '/api/motion/regenerate',
        '/api/motion/agent-handoff',
      ],
      receiptLabels: expect.arrayContaining([
        'capture receipt',
        'viewport receipt',
        'cursor target receipt',
        'app launch readiness',
        'redaction receipt',
      ]),
    });
    expect(plan.skillDraft.capabilityPlan).toMatchObject({
      kind: 'motion-workflow-capability-plan',
      mode: 'review',
      primaryAction: 'request-review',
      canRunFullAuto: true,
      fullAutoTemplateHints: ['full-auto-run', 'full-auto-computer-use-run'],
      reviewTemplateHints: expect.arrayContaining([
        'review-capture',
        'review-computer-use-capture',
        'generate-visuals',
        'generate-voice',
        'sync-timeline',
        'prepare-preview-source',
        'author-source',
        'edit-source',
        'render-proof',
        'export-pack',
      ]),
      steps: expect.arrayContaining([
        expect.objectContaining({
          id: 'capability-step-plan',
          gateId: 'plan',
          label: 'Video plan',
          reviewRequired: true,
          reviewObjectLabels: expect.arrayContaining(['Tong repo']),
          editSurfaceLabels: expect.arrayContaining(['script']),
          agentTemplateHints: ['motion-start'],
        }),
        expect.objectContaining({
          id: 'capability-step-drafts',
          gateId: 'drafts',
          reviewObjectLabels: expect.arrayContaining([
            'Proof-first launch',
            'Demo-first launch',
            'Founder-note launch',
          ]),
          agentTemplateHints: expect.arrayContaining([
            'select-draft-*',
            'regenerate-component-*',
          ]),
        }),
        expect.objectContaining({
          id: 'capability-step-capture',
          gateId: 'capture',
          reviewObjectLabels: expect.arrayContaining(['Regenerate App frame']),
          editSurfaceLabels: expect.arrayContaining(['capture', 'crop', 'cursor path']),
          agentTemplateHints: expect.arrayContaining([
            'review-capture',
            'review-computer-use-capture',
            'record-product-flow',
          ]),
        }),
        expect.objectContaining({
          id: 'capability-step-timeline',
          gateId: 'timeline',
          reviewObjectLabels: expect.arrayContaining(['Timeline sync and source edits']),
          editSurfaceLabels: expect.arrayContaining(['timing', 'effect']),
          agentTemplateHints: expect.arrayContaining([
            'sync-timeline',
            'apply-timeline-revision',
            'prepare-preview-source',
            'author-source',
            'edit-source',
          ]),
        }),
        expect.objectContaining({
          id: 'capability-step-export',
          gateId: 'export',
          reviewObjectLabels: expect.arrayContaining(['x 9:16 30s export pack']),
          editSurfaceLabels: expect.arrayContaining(['export']),
          agentTemplateHints: ['export-pack'],
        }),
      ]),
    });
    expect(plan.skillDraft.manifest.instructions).toContain('Review video plan before continuing');
    expect(plan.skillDraft.manifest.instructions).toContain('repoPath');
    expect(plan.skillDraft.manifest.instructions).toContain('Editable objects: story beats, draft variations');
    expect(plan.skillDraft.manifest.instructions).toContain('## Editable Source Package');
    expect(plan.skillDraft.manifest.instructions).toContain('Remotion source package');
    expect(plan.skillDraft.manifest.instructions).toContain('HyperFrames source package');
    expect(plan.skillDraft.manifest.instructions).toContain('Preview source files');
    expect(plan.skillDraft.manifest.instructions).toContain('Runtime mount target');
    expect(plan.skillDraft.manifest.instructions).toContain('## Review Loop');
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Show video plan, draft board, regenerate actions, source package, render proof, and export pack before final export.'
    );
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Modes: Review gates, Full auto'
    );
    expect(plan.skillDraft.manifest.instructions).toContain('Regenerate App frame');
    expect(plan.skillDraft.manifest.instructions).toContain('/api/motion/full-auto');
    expect(plan.skillDraft.manifest.instructions).toContain('## Capture Contract');
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Preferred path: Launch local or hosted app, capture browser stills and DOM, record only if the video needs product motion, then fall back to computer-use with creator approval.'
    );
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Tools: app launch, browser capture, screen recording, computer-use fallback'
    );
    expect(plan.skillDraft.manifest.instructions).toContain('app launch readiness');
    expect(plan.skillDraft.manifest.instructions).toContain('redaction receipt');
    expect(plan.skillDraft.manifest.instructions).toContain('app captures');
    expect(plan.skillDraft.manifest.instructions).toContain('effect cues');
    expect(plan.skillDraft.manifest.instructions).toContain('## Skill Packs');
    expect(plan.skillDraft.manifest.instructions).toContain('npx skills add iart-ai/motion-design-skills');
    expect(plan.skillDraft.manifest.instructions).toContain('contact-sheet.sh');
    expect(plan.skillDraft.manifest.instructions).toContain('## Review Surfaces');
    expect(plan.skillDraft.manifest.instructions).toContain('## Research Signals');
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Read capturePlan.agentRunbook before capturing app media.'
    );
    expect(plan.skillDraft.manifest.instructions).toContain(
      'Use browser capture first, then computer-use capture when auth, native UI, simulator, or gesture state blocks the browser.'
    );
    expect(plan.skillDraft.manifest.instructions).toContain('Screen Studio');
    expect(plan.skillDraft.manifest.instructions).toContain('Clueso');
    expect(plan.skillDraft.manifest.instructions).toContain('iart motion-skills');
    expect(plan.skillDraft.manifest.instructions).toContain('Real product capture');
    expect(plan.skillDraft.manifest.instructions).toContain('Capture plan');
    expect(plan.skillDraft.manifest.instructions).not.toMatch(
      /operator|dashboard|control plane/i
    );
  });
});
