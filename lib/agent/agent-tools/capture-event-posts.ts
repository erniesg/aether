import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'capture_event_posts',
  description:
    'Capture visual evidence screenshots for stored event recap X and LinkedIn post URLs. This is a post-discovery evidence pass: it visits selected post URLs with a local Playwright browser, saves PNG files plus a manifest, and reports whether each URL captured a post card, a fallback page, or a login/checkpoint wall. Use after refresh_event_recap has found the corpus. Authenticated LinkedIn/X captures require a storageStatePath or userDataDir for a logged-in browser profile.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        description: 'Stored event recap id, e.g. "ai-engineer-singapore".',
      },
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['x', 'linkedin'] },
        description: 'Platform subset to capture. Defaults to X and LinkedIn.',
      },
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional explicit post URLs. When set, these are captured in order.',
      },
      all: {
        type: 'boolean',
        description:
          'When true, capture every matching stored X/LinkedIn post instead of the default sample limit. Use carefully for large corpora.',
      },
      limit: {
        type: 'number',
        description: 'Maximum total posts to capture when urls is not supplied. Default 20.',
      },
      perPlatform: {
        type: 'number',
        description: 'Maximum posts to capture per platform, useful for balanced X + LinkedIn samples.',
      },
      runId: {
        type: 'string',
        description:
          'Optional stable run id / output directory name. Use with resume=true for large batches.',
      },
      resume: {
        type: 'boolean',
        description:
          'When true, skip post URLs whose expected screenshot already exists in the selected run directory.',
      },
      includeLinkedInComments: {
        type: 'boolean',
        description:
          'When false, hide LinkedIn comment/action sections before screenshotting the post card. Defaults true for backward compatibility.',
      },
      includeIrrelevant: {
        type: 'boolean',
        description: 'When true, include posts tagged irrelevant:event. Defaults false.',
      },
      headless: {
        type: 'boolean',
        description: 'Run browser headless. Set false locally when you need to complete login by hand.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Per-page navigation timeout. Default 25000.',
      },
      waitAfterLoadMs: {
        type: 'number',
        description: 'Extra wait after DOM load for JS-rendered post cards. Default 2500.',
      },
      concurrency: {
        type: 'number',
        description:
          'Maximum parallel browser pages for local Playwright capture. Default 3, max 6.',
      },
      storageStatePath: {
        type: 'string',
        description: 'Optional Playwright storage state JSON containing logged-in X/LinkedIn cookies.',
      },
      userDataDir: {
        type: 'string',
        description: 'Optional persistent Chromium user data directory to reuse a logged-in capture profile.',
      },
    },
    required: ['eventId'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const captureEventPosts: AgentTool = {
  tool,
  dispatch: {
    registryId: 'post-capture',
    path: '/api/events/captures',
    provider: 'local-playwright',
    model: 'chromium-screenshot',
    toBody: (input) => input,
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const run = o.run && typeof o.run === 'object' ? (o.run as Record<string, unknown>) : {};
    const captures = Array.isArray(run.captures) ? (run.captures as Array<Record<string, unknown>>) : [];
    return JSON.stringify({
      ok: o.ok,
      eventId: run.eventId,
      runId: run.runId,
      targetCount: run.targetCount,
      capturedCount: run.capturedCount,
      resumedCount: run.resumedCount,
      pageCapturedCount: run.pageCapturedCount,
      blockedCount: run.blockedCount,
      failedCount: run.failedCount,
      manifestPath: run.manifestPath,
      samples: captures.slice(0, 8).map((capture) => ({
        platform: capture.platform,
        status: capture.status,
        url: capture.url,
        screenshotRelPath: capture.screenshotRelPath,
        blockedReason: capture.blockedReason,
        error: capture.error,
      })),
    });
  },
};
