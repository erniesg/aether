import type { FrontierSessionInput, FrontierSpeakerInput } from './frontier';

type Fetcher = typeof fetch;

interface OfficialScheduleApiSession {
  title?: string;
  topics?: string[];
  startsAt?: string;
  speakers?: Array<{
    name?: string;
    company?: string;
    title?: string;
  }>;
}

interface OfficialScheduleApiResponse {
  sessions?: OfficialScheduleApiSession[];
}

export interface OfficialScheduleFrontier {
  speakers: FrontierSpeakerInput[];
  sessions: FrontierSessionInput[];
  sourceUrls: string[];
  warnings: string[];
}

export async function fetchOfficialScheduleFrontier(
  input: {
    eventName: string;
    officialUrl?: string;
    sourceUrls?: string[];
  },
  fetcher: Fetcher = fetch
): Promise<OfficialScheduleFrontier> {
  const urls = officialScheduleApiUrls(input);
  const speakers: FrontierSpeakerInput[] = [];
  const sessions: FrontierSessionInput[] = [];
  const warnings: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetcher(url);
      if (!res.ok) {
        warnings.push(`Official schedule fetch failed for ${url}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as OfficialScheduleApiResponse;
      for (const session of json.sessions ?? []) {
        const title = session.title?.trim();
        if (!title) continue;
        const isKeynote = (session.topics ?? []).some((topic) => /keynote/i.test(topic));
        const sessionSpeakers = (session.speakers ?? [])
          .map((speaker): FrontierSpeakerInput | undefined => {
            const name = speaker.name?.trim();
            if (!name) return undefined;
            return {
              name,
              company: speaker.company,
              title: speaker.title,
              role: isKeynote ? 'keynote' : 'speaker',
              sessionTitle: title,
              topics: session.topics,
            };
          })
          .filter((speaker): speaker is FrontierSpeakerInput => Boolean(speaker));
        sessions.push({
          title,
          speakers: sessionSpeakers,
          topics: session.topics,
          startsAt: session.startsAt,
        });
        speakers.push(...sessionSpeakers);
      }
    } catch (err) {
      warnings.push(
        `Official schedule fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    speakers,
    sessions,
    sourceUrls: urls,
    warnings,
  };
}

function officialScheduleApiUrls(input: {
  eventName: string;
  officialUrl?: string;
  sourceUrls?: string[];
}): string[] {
  const candidates = [input.officialUrl, ...(input.sourceUrls ?? [])].filter(
    (url): url is string => Boolean(url)
  );
  const isAiEngineerSingapore =
    /ai\s*engineer/i.test(input.eventName) &&
    /singapore/i.test([input.eventName, ...candidates].join(' '));
  const hasOfficialAiEngineerSingaporeUrl = candidates.some((raw) => {
    try {
      const url = new URL(raw);
      return /(^|\.)ai\.engineer$/i.test(url.hostname) && /singapore/i.test(url.pathname);
    } catch {
      return false;
    }
  });

  if (!isAiEngineerSingapore && !hasOfficialAiEngineerSingaporeUrl) return [];
  return ['https://aie.65labs.org/api/v1/sessions?format=talk'];
}
