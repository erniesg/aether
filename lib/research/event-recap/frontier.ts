import type { EventExpansionAnchor, EventExpansionPlan } from './types';
import { normalizeQuerySet } from './utils';

export interface FrontierSpeakerInput {
  name: string;
  company?: string;
  title?: string;
  role?: 'keynote' | 'headline' | 'speaker' | 'organizer' | 'sponsor';
  sessionTitle?: string;
  profileUrl?: string;
  handle?: string;
  topics?: string[];
}

export interface FrontierSessionInput {
  title: string;
  speakers?: FrontierSpeakerInput[];
  topics?: string[];
  startsAt?: string;
}

export interface SeedFrontierInput {
  eventName: string;
  contextHint?: string;
  officialUrl?: string;
  sourceUrls?: string[];
  speakers?: FrontierSpeakerInput[];
  sessions?: FrontierSessionInput[];
  sponsors?: string[];
  maxQueries?: number;
}

export function deriveSeedFrontier(input: SeedFrontierInput): EventExpansionPlan {
  const maxQueries = input.maxQueries ?? 12;
  const eventName = input.eventName.trim();
  const context = input.contextHint?.trim();
  const anchors: EventExpansionAnchor[] = [
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: eventName,
      query: eventName,
      score: 80,
      bias: 'literal event-name search; high precision but often low recall',
    }),
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: `"${eventName}"`,
      query: `"${eventName}"`,
      score: 78,
      bias: 'exact phrase search; useful for canonical mentions, usually misses casual posts',
    }),
    ...(!/\bsingapore\b/i.test(eventName)
      ? [
          anchor({
            kind: 'query',
            sourceKind: 'broad-public-search',
            value: `${eventName} Singapore`,
            query: `${eventName} Singapore`,
            score: 74,
            bias: 'location-constrained keyword search; may over-sample event listings',
          }),
        ]
      : []),
    anchor({
      kind: 'query',
      sourceKind: 'broad-public-search',
      value: '"AI engineer" Singapore',
      query: '"AI engineer" Singapore',
      score: 68,
      bias: 'topic keyword search; mixes event conversation with general role/career posts',
    }),
  ];

  if (/\bai\s*engineer\b/i.test(eventName)) {
    anchors.push(
      anchor({
        kind: 'mention',
        sourceKind: 'official-schedule',
        value: '@aiDotEngineer',
        query: '@aiDotEngineer Singapore',
        score: 90,
        bias: 'organizer-biased; strong for discovery but announcement-heavy',
      }),
      anchor({
        kind: 'hashtag',
        sourceKind: 'broad-public-search',
        value: '#aiengineer',
        query: '#aiengineer Singapore',
        score: 62,
        bias: 'hashtag-biased; useful when attendees use official tags',
      })
    );
  }

  const speakers = normalizeSpeakers([
    ...(input.speakers ?? []),
    ...(input.sessions ?? []).flatMap((session) =>
      (session.speakers ?? []).map((speaker) => ({
        ...speaker,
        role: speaker.role ?? roleFromSession(session),
        sessionTitle: speaker.sessionTitle ?? session.title,
        topics: speaker.topics ?? session.topics,
      }))
    ),
  ]);
  for (const speaker of speakers.slice(0, 32)) {
    const isKeynote = speaker.role === 'keynote';
    const isHeadline = speaker.role === 'headline';
    anchors.push(
      anchor({
        kind: 'author',
        sourceKind: speaker.profileUrl || speaker.handle ? 'speaker-account' : 'official-schedule',
        value: speaker.handle ? `@${stripAt(speaker.handle)}` : speaker.name,
        query: speaker.handle
          ? `@${stripAt(speaker.handle)} ${eventName}`
          : `"${speaker.name}" "${eventName}"`,
        score: isKeynote ? 76 : isHeadline ? 74 : 54,
        bias: isKeynote
          ? 'keynote-speaker-biased; strong for talk reactions but may over-sample announcements'
          : isHeadline
            ? 'headline-speaker-biased; strong for major public-interest sessions but may over-sample announcements'
          : 'speaker-biased; useful for talk-specific discovery but announcement-heavy',
      })
    );
    if ((isKeynote || isHeadline) && speaker.company) {
      anchors.push(
        anchor({
          kind: 'entity',
          sourceKind: 'official-schedule',
          value: speaker.company,
          query: `"${speaker.company}" "${eventName}"`,
          score: isKeynote ? 48 : 46,
          bias: isKeynote
            ? 'keynote-company-derived; useful for talk discovery, not attendee sentiment'
            : 'headline-company-derived; useful for public-interest talk discovery, not attendee sentiment',
        })
      );
    }
  }

  for (const session of normalizeSessions(input.sessions ?? []).slice(0, 12)) {
    const role = roleFromSession(session);
    if (role !== 'keynote' && role !== 'headline') continue;
    const phrase = compactSessionPhrase(session.title);
    if (!phrase) continue;
    anchors.push(
      anchor({
        kind: 'query',
        sourceKind: 'official-schedule',
        value: phrase,
        query: `"${phrase}" "${eventName}"`,
        score: role === 'keynote' ? 50 : 49,
        bias:
          role === 'keynote'
            ? 'keynote-session-title-derived; high precision but often low recall'
            : 'headline-session-title-derived; high precision for public-interest sessions but often low recall',
      })
    );
  }

  for (const sponsor of normalizeQuerySet(input.sponsors ?? [], 12)) {
    anchors.push(
      anchor({
        kind: 'entity',
        sourceKind: 'sponsor-org',
        value: sponsor,
        query: `"${sponsor}" "${eventName}"`,
        score: 44,
        bias: 'sponsor-biased; useful for coverage and booth posts, often promotional',
      })
    );
  }

  if (context) {
    for (const phrase of contextPhrases(context).slice(0, 4)) {
      anchors.push(
        anchor({
          kind: 'query',
          sourceKind: 'broad-public-search',
          value: phrase,
          query: `${phrase} ${eventName}`,
          score: 40,
          bias: 'context-derived keyword; validate with corpus before summarizing',
        })
      );
    }
  }

  const sourceDomains = new Set(
    [input.officialUrl, ...(input.sourceUrls ?? [])]
      .filter((url): url is string => Boolean(url))
      .map(domainFromUrl)
      .filter((domain): domain is string => Boolean(domain))
  );
  for (const domain of sourceDomains) {
    anchors.push(
      anchor({
        kind: 'entity',
        sourceKind: 'official-schedule',
        value: domain,
        query: `${domain} "${eventName}"`,
        score: 30,
        bias: 'official-source-derived; useful for speaker/sponsor discovery, not sentiment',
      })
    );
  }

  const querySet = normalizeQuerySet(
    anchors.sort((a, b) => b.score - a.score).map((item) => item.query),
    maxQueries
  );

  return {
    eventName,
    generatedAt: Date.now(),
    corpus: { posts: 0, platforms: { x: 0, linkedin: 0 } },
    anchors,
    querySet,
    warnings: ['Seed frontier has no corpus yet; use it for recall, then re-rank from scraped posts.'],
  };
}

function anchor(
  input: Omit<EventExpansionAnchor, 'count' | 'platforms' | 'samplePostIds' | 'reason'>
): EventExpansionAnchor {
  return {
    ...input,
    count: 0,
    platforms: [],
    samplePostIds: [],
    reason: `${input.sourceKind} seed`,
  };
}

function contextPhrases(context: string): string[] {
  return normalizeQuerySet(
    context
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4 && part.length <= 80),
    8
  );
}

function normalizeSpeakers(speakers: FrontierSpeakerInput[]): FrontierSpeakerInput[] {
  const seen = new Set<string>();
  const out: FrontierSpeakerInput[] = [];
  for (const speaker of speakers) {
    const name = speaker.name?.trim().replace(/\s+/g, ' ');
    if (!name || /^(tba|kickoff|speaker)$/i.test(name)) continue;
    const key = `${name}:${speaker.company ?? ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...speaker, name });
  }
  return out.sort((a, b) => speakerScore(b) - speakerScore(a));
}

function speakerScore(speaker: FrontierSpeakerInput): number {
  return (
    (speaker.role === 'keynote' ? 1000 : speaker.role === 'headline' ? 900 : 0) +
    (speaker.company ? 10 : 0)
  );
}

function roleFromSession(session: FrontierSessionInput): FrontierSpeakerInput['role'] {
  if (session.topics?.some((topic) => /keynote/i.test(topic))) return 'keynote';
  const text = [
    session.title,
    ...(session.speakers ?? []).flatMap((speaker) => [speaker.title, speaker.company]),
    ...(session.topics ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  if (/\b(minister|ministry|foreign affairs|govtech|government|cabinet|prime minister|public sector)\b/i.test(text)) {
    return 'headline';
  }
  return 'speaker';
}

function normalizeSessions(sessions: FrontierSessionInput[]): FrontierSessionInput[] {
  const seen = new Set<string>();
  const out: FrontierSessionInput[] = [];
  for (const session of sessions) {
    const title = session.title?.trim().replace(/\s+/g, ' ');
    if (!title || /^(tba|kickoff)$/i.test(title)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...session, title });
  }
  return out;
}

function compactSessionPhrase(title: string): string | undefined {
  const phrase = title
    .replace(/[“”]/g, '"')
    .split(/[:—-]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (phrase.length < 6 || phrase.length > 80) return undefined;
  return phrase;
}

function stripAt(value: string): string {
  return value.trim().replace(/^@+/, '');
}

function domainFromUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host || undefined;
  } catch {
    return undefined;
  }
}
