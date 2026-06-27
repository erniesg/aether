import { describe, expect, it } from 'vitest';

import type { MotionProject } from './project';
import {
  materializeMotionAgentRequestTemplate,
  type MotionAgentRequestTemplate,
} from './agentHandoff';

const project: MotionProject = {
  id: 'motion-tong-full-auto',
  workspaceId: 'demo-ws',
  title: 'tong launch video',
  brief: {
    projectKind: 'launch',
    appProfile: {
      name: 'tong',
      summary: 'City-specific language learning app.',
      stack: ['TypeScript'],
    },
    audience: 'language learners',
    platformTargets: [{ platform: 'x', aspectRatio: '9:16', seconds: 30 }],
    claims: [],
    tone: 'textural',
    brandMotion: {
      palette: ['#111111', '#f7f4ee'],
      fontFamilies: ['Inter'],
      motionStyle: 'kinetic editorial',
    },
  },
  story: [],
  workflowMode: 'full-auto',
  currentDraftId: 'draft-primary',
  drafts: [],
  tracks: [],
  graphNodes: [],
  exports: [],
  sourceRefs: [],
  createdAt: 1,
  updatedAt: 1,
};

function template(body: Record<string, unknown>): MotionAgentRequestTemplate {
  return {
    id: 'full-auto-run',
    label: 'Run saved gates',
    method: 'POST',
    route: '/api/motion/full-auto',
    toolId: 'motion-render',
    body,
    inputPlaceholders: [
      '$motionProject',
      '$imageToVideoProviderId',
      '$voiceProviderId',
      '$renderProviderId',
      '$editedSourceFiles',
    ],
    expectedReceipts: ['export pack'],
  };
}

describe('materializeMotionAgentRequestTemplate', () => {
  it('replaces nested placeholders with a project and provider selections', () => {
    const sourceTemplate = template({
      project: '$motionProject',
      nested: {
        imageToVideoProviderId: '$imageToVideoProviderId',
        voiceProviderId: '$voiceProviderId',
      },
      files: '$editedSourceFiles',
      renderProviderId: '$renderProviderId',
      unchanged: 'literal',
    });

    const result = materializeMotionAgentRequestTemplate(sourceTemplate, {
      project,
      imageToVideoProviderId: 'image-provider',
      voiceProviderId: 'voice-provider',
      renderProviderId: 'render-provider',
      editedSourceFiles: [{ path: 'src/video.tsx', contents: 'export {}' }],
    });

    expect(result).toEqual({
      templateId: 'full-auto-run',
      label: 'Run saved gates',
      method: 'POST',
      route: '/api/motion/full-auto',
      toolId: 'motion-render',
      body: {
        project,
        nested: {
          imageToVideoProviderId: 'image-provider',
          voiceProviderId: 'voice-provider',
        },
        files: [{ path: 'src/video.tsx', contents: 'export {}' }],
        renderProviderId: 'render-provider',
        unchanged: 'literal',
      },
      missingPlaceholders: [],
    });
    expect(sourceTemplate.body).toEqual({
      project: '$motionProject',
      nested: {
        imageToVideoProviderId: '$imageToVideoProviderId',
        voiceProviderId: '$voiceProviderId',
      },
      files: '$editedSourceFiles',
      renderProviderId: '$renderProviderId',
      unchanged: 'literal',
    });
  });

  it('reports placeholders that cannot be resolved', () => {
    const result = materializeMotionAgentRequestTemplate(
      template({
        project: '$motionProject',
        renderProviderId: '$renderProviderId',
      }),
      { project }
    );

    expect(result.missingPlaceholders).toEqual(['$renderProviderId']);
    expect(result.body.renderProviderId).toBe('$renderProviderId');
  });

  it('omits optional provider placeholders when no provider is selected', () => {
    const result = materializeMotionAgentRequestTemplate(
      template({
        project: '$motionProject',
        imageToVideoProviderId: '$imageToVideoProviderId?',
        voiceProviderId: '$voiceProviderId?',
        renderProviderId: '$renderProviderId?',
      }),
      { project }
    );

    expect(result.missingPlaceholders).toEqual([]);
    expect(result.body).toEqual({ project });
  });
});
