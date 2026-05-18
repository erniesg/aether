import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'warm_linkedin_session',
  description:
    'Start a TinyFish LinkedIn Vault/profile warm-up run and return handoff state. If LinkedIn needs human verification, use inspectorUrl for interactive verification; streamingUrl is read-only preview/provenance only. After the session is ready, refresh_event_recap with linkedinMode=browser-direct can collect logged-in post metadata and visible views/impressions when LinkedIn renders them; public Search+Fetch remains cheaper for high-recall fanout.',
  input_schema: {
    type: 'object',
    properties: {
      holdMinutes: {
        type: 'number',
        description: 'How long TinyFish should keep the LinkedIn handoff run alive. Default 10, max 20.',
      },
      pollSeconds: {
        type: 'number',
        description: 'How long this tool should poll for a run/inspector URL before returning. Default 18.',
      },
      targetUrl: {
        type: 'string',
        description: 'LinkedIn URL to open. Defaults to https://www.linkedin.com/feed/.',
      },
      syncVault: {
        type: 'boolean',
        description: 'When true, sync TinyFish Vault before warming the LinkedIn session.',
      },
    },
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const warmLinkedInSession: AgentTool = {
  tool,
  dispatch: {
    registryId: 'linkedin-session-warmup',
    path: '/api/events/linkedin-session',
    provider: 'tinyfish',
    model: 'agent-browser-vault-profile',
    toBody: (input) => input,
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    const session =
      o.session && typeof o.session === 'object' ? (o.session as Record<string, unknown>) : {};
    return JSON.stringify({
      ok: o.ok,
      status: session.status,
      runId: session.runId,
      needsHumanVerification: session.needsHumanVerification,
      inspectorUrl: session.inspectorUrl,
      streamingUrl: session.streamingUrl,
      browserBaseUrl: session.browserBaseUrl,
      warnings: session.warnings,
      error: session.error,
    });
  },
};
