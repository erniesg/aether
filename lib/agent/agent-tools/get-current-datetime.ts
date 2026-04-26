import type Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'get_current_datetime',
  description:
    'Return the current datetime in ISO8601 along with the IANA timezone (default Asia/Singapore). Use this when scheduling, freshness checks, or any reasoning that depends on "now". Cheap and synchronous — call freely.',
  input_schema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description:
          'Optional IANA timezone (e.g. "Asia/Singapore", "Asia/Tokyo"). Defaults to Asia/Singapore.',
      },
    },
    required: [],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const getCurrentDatetime: AgentTool = {
  tool,
  dispatch: {
    registryId: 'datetime',
    provider: 'local',
    model: 'system-clock',
    local: (input) => {
      const i = (input ?? {}) as { timezone?: string };
      const tz =
        typeof i.timezone === 'string' && i.timezone.length > 0
          ? i.timezone
          : 'Asia/Singapore';
      const now = new Date();
      // Format the local-time string in the requested timezone using
      // Intl.DateTimeFormat. Falls back to 'Asia/Singapore' on bad zone.
      let localFormatted: string;
      let resolvedTz: string;
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        localFormatted = fmt.format(now).replace(', ', 'T');
        resolvedTz = tz;
      } catch {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Singapore',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        localFormatted = fmt.format(now).replace(', ', 'T');
        resolvedTz = 'Asia/Singapore';
      }
      return {
        ok: true,
        provider: 'local',
        nowUtc: now.toISOString(),
        nowLocal: localFormatted,
        timezone: resolvedTz,
        epochMs: now.getTime(),
      };
    },
  },
  summarizeOutput: (output) => {
    if (!output || typeof output !== 'object') return JSON.stringify(output ?? null);
    const o = output as Record<string, unknown>;
    return JSON.stringify({
      ok: o.ok,
      nowUtc: o.nowUtc,
      nowLocal: o.nowLocal,
      timezone: o.timezone,
    });
  },
};
