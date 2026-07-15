import { describe, expect, it } from 'vitest';
import { motionComponentIds } from './componentRegistry';
import {
  buildEventRecapMotionProject,
  DEFAULT_EVENT_RECAP_PLATFORM_TARGETS,
  type BuildEventRecapMotionProjectInput,
} from './recapMotion';

const VERBATIM_QUOTE =
  "Best conference I've been to in years — the hallway track alone was worth the flight.";

function baseInput(): BuildEventRecapMotionProjectInput {
  return {
    id: 'motion-aie-recap',
    workspaceId: 'demo-ws',
    eventId: 'ai-engineer-singapore',
    eventName: 'AI Engineer Singapore',
    stats: {
      postCount: 1331,
      viewCount: 4679086,
      platforms: ['x', 'linkedin', 'youtube'],
    },
    themes: [
      {
        id: 'story-keynote',
        label: 'Keynote and mainstage moments',
        summary: 'The keynote set the agentic-engineering agenda for the week.',
        topPostUrls: ['https://x.com/agrimsingh/status/2053366862248026480'],
      },
      {
        id: 'story-workshops',
        label: 'Workshops and hands-on tracks',
        summary: 'Hands-on tracks filled rooms from Codex to eval tooling.',
        topPostUrls: ['https://x.com/swyx/status/2054894329446244469'],
      },
      {
        id: 'story-community',
        label: 'Community and hallway energy',
        summary: 'Hallway conversations and side events carried the builder energy.',
        topPostUrls: ['https://www.linkedin.com/posts/rachaeldefoe-recap'],
      },
      {
        id: 'story-overflow',
        label: 'Overflow theme beyond the beat cap',
        summary: 'Should not become a story beat.',
        topPostUrls: [],
      },
    ],
    quotes: [
      {
        text: VERBATIM_QUOTE,
        author: 'Agrim Singh',
        sourceUrl: 'https://x.com/agrimsingh/status/2055482913563840742',
      },
    ],
    createdAt: 500,
  };
}

describe('buildEventRecapMotionProject', () => {
  it('builds a social recap project with hook, numbers, story, quote, and outro beats', () => {
    const project = buildEventRecapMotionProject(baseInput());

    expect(project.id).toBe('motion-aie-recap');
    expect(project.title).toBe('AI Engineer Singapore recap video');
    expect(project.brief.projectKind).toBe('social');

    expect(project.story.map((beat) => beat.id)).toEqual([
      'beat-recap-hook',
      'beat-recap-numbers',
      'beat-recap-theme-1',
      'beat-recap-theme-2',
      'beat-recap-theme-3',
      'beat-recap-quote',
      'beat-recap-outro',
    ]);
    expect(project.story.map((beat) => beat.role)).toEqual([
      'hook',
      'proof',
      'evidence',
      'evidence',
      'evidence',
      'payoff',
      'cta',
    ]);

    const validTemplateIds = motionComponentIds();
    for (const beat of project.story) {
      expect(validTemplateIds).toContain(beat.templateId);
    }

    const hook = project.story[0];
    expect(hook.templateId).toBe('hook-card');
    expect(hook.narration).toContain('AI Engineer Singapore');
    expect(hook.narration).toContain('1,331');

    const numbers = project.story[1];
    expect(numbers.templateId).toBe('data-visual-card');
    expect(numbers.narration).toContain('1,331');
    expect(numbers.narration).toContain('4,679,086');
    expect(numbers.narration).toContain('x, linkedin, youtube');

    const firstTheme = project.story[2];
    expect(firstTheme.templateId).toBe('evidence-card');
    expect(firstTheme.narration).toContain('Keynote and mainstage moments');
    expect(firstTheme.narration).toContain(
      'The keynote set the agentic-engineering agenda for the week.'
    );
    expect(firstTheme.provenance).toContainEqual({
      kind: 'reference',
      ref: 'https://x.com/agrimsingh/status/2053366862248026480',
      label: 'Keynote and mainstage moments',
    });
  });

  it('passes verbatim quotes through unchanged with source attribution', () => {
    const project = buildEventRecapMotionProject(baseInput());
    const quoteBeat = project.story.find((beat) => beat.id === 'beat-recap-quote');

    expect(quoteBeat).toBeDefined();
    expect(quoteBeat?.narration).toBe(VERBATIM_QUOTE);
    expect(quoteBeat?.templateId).toBe('proof-card');
    expect(quoteBeat?.provenance).toContainEqual({
      kind: 'reference',
      ref: 'https://x.com/agrimsingh/status/2055482913563840742',
      label: 'Agrim Singh',
    });
  });

  it('omits the quote beat when no verbatim quotes are provided', () => {
    const withoutQuotes = buildEventRecapMotionProject({ ...baseInput(), quotes: [] });

    expect(withoutQuotes.story.map((beat) => beat.id)).not.toContain('beat-recap-quote');
    expect(withoutQuotes.story.map((beat) => beat.role)).not.toContain('payoff');
    for (const draft of withoutQuotes.drafts) {
      expect(draft.story.map((beat) => beat.id)).not.toContain('beat-recap-quote');
    }

    const blankQuote = buildEventRecapMotionProject({
      ...baseInput(),
      quotes: [{ text: '   ', author: 'Nobody', sourceUrl: 'https://example.com/post' }],
    });
    expect(blankQuote.story.map((beat) => beat.id)).not.toContain('beat-recap-quote');
  });

  it('fans exports out across x, linkedin, instagram, and youtube formats by default', () => {
    const project = buildEventRecapMotionProject(baseInput());

    expect(project.exports.map((item) => item.id)).toEqual([
      'export-x-9x16',
      'export-linkedin-16x9',
      'export-instagram-1x1',
      'export-instagram-4x5',
      'export-youtube-16x9',
    ]);
    expect(
      project.exports.map((item) => ({ platform: item.platform, aspectRatio: item.aspectRatio }))
    ).toEqual(
      DEFAULT_EVENT_RECAP_PLATFORM_TARGETS.map((target) => ({
        platform: target.platform,
        aspectRatio: target.aspectRatio,
      }))
    );
    for (const item of project.exports) {
      expect(item.status).toBe('planned');
      expect(item.provenance.length).toBeGreaterThan(0);
    }
    expect(project.brief.platformTargets).toHaveLength(5);
  });

  it('respects caller-provided platform targets', () => {
    const project = buildEventRecapMotionProject({
      ...baseInput(),
      platformTargets: [{ platform: 'tiktok', aspectRatio: '9:16', seconds: 20 }],
    });

    expect(project.exports.map((item) => item.id)).toEqual(['export-tiktok-9x16']);
  });

  it('records recap ingest graph nodes and typed provenance', () => {
    const project = buildEventRecapMotionProject(baseInput());

    expect(project.graphNodes.map((node) => node.id)).toEqual([
      'node-recap-ingest',
      'node-script',
      'node-storyboard',
    ]);
    expect(project.graphNodes.map((node) => node.kind)).toEqual([
      'recap-ingest',
      'script',
      'storyboard',
    ]);
    expect(project.graphNodes[0]).toMatchObject({
      inputRefs: ['event-recap:ai-engineer-singapore'],
      status: 'done',
    });
    expect(project.graphNodes[1].outputRefs).toEqual(project.story.map((beat) => beat.id));
    expect(project.graphNodes[2].outputRefs).toEqual(
      project.story.map((beat) => beat.templateId ?? beat.id)
    );

    expect(project.sourceRefs).toContainEqual({
      kind: 'reference',
      ref: 'event-recap:ai-engineer-singapore',
      label: 'AI Engineer Singapore',
    });
    for (const beat of project.story) {
      expect(beat.provenance.length).toBeGreaterThan(0);
    }
    for (const draft of project.drafts) {
      expect(draft.provenance.length).toBeGreaterThan(0);
    }
    for (const node of project.graphNodes) {
      expect(node.provenance.length).toBeGreaterThan(0);
    }
  });

  it('ships a primary cut and a numbers-first cut', () => {
    const project = buildEventRecapMotionProject(baseInput());

    expect(project.drafts.map((draft) => draft.id)).toEqual([
      'draft-recap-primary',
      'draft-recap-numbers-first',
    ]);
    expect(project.currentDraftId).toBe('draft-recap-primary');
    expect(project.drafts[0].story.map((beat) => beat.id)).toEqual(
      project.story.map((beat) => beat.id)
    );
    expect(project.drafts[1].story.map((beat) => beat.id)).toEqual([
      'beat-recap-hook',
      'beat-recap-numbers',
      'beat-recap-theme-1',
      'beat-recap-quote',
      'beat-recap-outro',
    ]);
  });

  it('includes a media contact-sheet beat when media refs are provided', () => {
    const project = buildEventRecapMotionProject({
      ...baseInput(),
      mediaRefs: [
        {
          assetId: 'asset-photo-1',
          label: 'crowd shot',
          sourceUrl: 'https://x.com/agrimsingh/status/2053366862248026480/photo/1',
        },
      ],
    });

    const mediaBeat = project.story.find((beat) => beat.id === 'beat-recap-media');
    expect(mediaBeat).toMatchObject({
      role: 'demo',
      templateId: 'contact-sheet-proof',
      selectedAssetIds: ['asset-photo-1'],
    });
    expect(mediaBeat?.provenance).toContainEqual({
      kind: 'reference',
      ref: 'https://x.com/agrimsingh/status/2053366862248026480/photo/1',
      label: 'crowd shot',
    });

    const ids = project.story.map((beat) => beat.id);
    expect(ids.indexOf('beat-recap-media')).toBeLessThan(ids.indexOf('beat-recap-quote'));
  });

  it('can materialize an editable timeline in the same workflow', () => {
    const project = buildEventRecapMotionProject({
      ...baseInput(),
      materializeTimeline: true,
    });

    expect(project.tracks.map((track) => track.kind)).toEqual([
      'text',
      'caption',
      'voice',
      'transition',
    ]);
    expect(project.drafts[0].status).toBe('ready');
    expect(project.graphNodes.map((node) => node.kind)).toContain('sync');
  });

  it('throws when no themes are provided', () => {
    expect(() => buildEventRecapMotionProject({ ...baseInput(), themes: [] })).toThrow(
      /theme/i
    );
  });
});
