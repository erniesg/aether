import { describe, expect, it } from 'vitest';
import { fetchOfficialScheduleFrontier } from './official-schedule';

describe('official event schedule frontier', () => {
  it('extracts keynote speakers from the supported AI Engineer Singapore schedule API', async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          sessions: [
            {
              title: "NanoClaw's agent factory",
              topics: ['agents', 'keynote'],
              startsAt: '2026-05-16T09:00:00+08:00',
              speakers: [
                {
                  name: 'Gavriel Cohen',
                  company: 'NanoCo, creators of NanoClaw',
                  title: 'CEO',
                },
              ],
            },
            {
              title: 'Demo',
              topics: ['demo'],
              speakers: [{ name: 'Builder', company: 'Example', title: 'Engineer' }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const frontier = await fetchOfficialScheduleFrontier(
      {
        eventName: 'AI Engineer Singapore',
        officialUrl: 'https://ai.engineer/singapore',
      },
      fetcher as typeof fetch
    );

    expect(frontier.sourceUrls).toEqual([
      'https://aie.65labs.org/api/v1/sessions?format=talk',
    ]);
    expect(frontier.speakers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Gavriel Cohen',
          company: 'NanoCo, creators of NanoClaw',
          role: 'keynote',
        }),
        expect.objectContaining({
          name: 'Builder',
          role: 'speaker',
        }),
      ])
    );
  });
});
