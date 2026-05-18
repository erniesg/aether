import type Anthropic from '@anthropic-ai/sdk';
import { deriveSeedFrontier } from '@/lib/research/event-recap/frontier';
import { fetchOfficialScheduleFrontier } from '@/lib/research/event-recap/official-schedule';
import type { AgentTool } from './types';

const tool: Anthropic.Messages.Tool = {
  name: 'generate_event_search_frontier',
  description:
    'Generate an initial event-search frontier before scraping: keyword queries, likely organizer/account anchors, source labels, and bias notes.',
  input_schema: {
    type: 'object',
    properties: {
      eventName: { type: 'string', description: 'Event or topic name.' },
      contextHint: {
        type: 'string',
        description: 'Optional extra context, speakers, location, or topic notes.',
      },
      officialUrl: { type: 'string', description: 'Optional official event URL.' },
      sourceUrls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional source URLs discovered by web search.',
      },
      speakers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            company: { type: 'string' },
            title: { type: 'string' },
            role: { type: 'string', enum: ['keynote', 'speaker', 'organizer', 'sponsor'] },
            sessionTitle: { type: 'string' },
            profileUrl: { type: 'string' },
            handle: { type: 'string' },
          },
          required: ['name'],
        },
        description:
          'Optional official speaker/keynote list. Names are fanned out into reusable search anchors with source/bias labels.',
      },
      sponsors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional sponsor/org names to fan out as sponsor-biased anchors.',
      },
      includeOfficialSchedule: {
        type: 'boolean',
        description:
          'When true, fetch a supported official schedule API from officialUrl/sourceUrls and add speaker/keynote anchors. Defaults true for supported events.',
      },
      maxQueries: { type: 'number', description: 'Maximum queries to return. Default 12.' },
    },
    required: ['eventName'],
  } as unknown as Anthropic.Messages.Tool['input_schema'],
};

export const generateEventSearchFrontier: AgentTool = {
  tool,
  dispatch: {
    registryId: 'event-search-frontier',
    provider: 'aether',
    model: 'event-frontier-heuristic',
    local: async (input) => {
      const i = input as {
        eventName: string;
        contextHint?: string;
        officialUrl?: string;
        sourceUrls?: string[];
        speakers?: Array<{
          name: string;
          company?: string;
          title?: string;
          role?: 'keynote' | 'speaker' | 'organizer' | 'sponsor';
          sessionTitle?: string;
          profileUrl?: string;
          handle?: string;
        }>;
        sponsors?: string[];
        includeOfficialSchedule?: boolean;
        maxQueries?: number;
      };
      const schedule =
        i.includeOfficialSchedule === false
          ? { speakers: [], sessions: [], sourceUrls: [], warnings: [] }
          : await fetchOfficialScheduleFrontier({
              eventName: i.eventName,
              officialUrl: i.officialUrl,
              sourceUrls: i.sourceUrls,
            });
      return {
        ok: true,
        plan: deriveSeedFrontier({
          eventName: i.eventName,
          contextHint: i.contextHint,
          officialUrl: i.officialUrl,
          sourceUrls: [...(i.sourceUrls ?? []), ...schedule.sourceUrls],
          speakers: [...(i.speakers ?? []), ...schedule.speakers],
          sessions: schedule.sessions,
          sponsors: i.sponsors,
          maxQueries: i.maxQueries,
        }),
        schedule: {
          speakers: schedule.speakers.length,
          keynotes: schedule.speakers.filter((speaker) => speaker.role === 'keynote').length,
          sourceUrls: schedule.sourceUrls,
          warnings: schedule.warnings,
        },
      };
    },
  },
  summarizeOutput: (output) => JSON.stringify(output),
};
