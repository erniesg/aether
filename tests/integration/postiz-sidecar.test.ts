import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  startPostizMockServer,
  type PostizMockServer,
} from '../fixtures/postiz-mock-server';

/**
 * Track G — end-to-end validation of the schedule fan-out / cancellation seam
 * against an in-process Postiz mock fixture. No real Postiz instance required.
 *
 * Flow under test:
 *   1. POST /api/publish/schedule with a 4-platform pack
 *      → 4 schedule POSTs land in the mock (one per platform), each preceded
 *        by an /upload-from-url call.
 *   2. DELETE /posts/:id against the mock
 *      → mock records the cancellation and the post is removed from the
 *        live list.
 *
 * The Postiz adapter (`lib/providers/publisher/postiz.ts`) is exercised via
 * the route handler — same path the workspace UI takes — so the seam under
 * test is the full HTTP wiring, not a vi.fn() shim.
 */

const ENV_KEYS = [
  'PUBLISHER_PROVIDER',
  'POSTIZ_API_KEY',
  'POSTIZ_API_URL',
  'POSTIZ_INTEGRATION_INSTAGRAM',
  'POSTIZ_INTEGRATION_X',
  'POSTIZ_INTEGRATION_LINKEDIN',
  'POSTIZ_INTEGRATION_PINTEREST',
  'POSTIZ_PINTEREST_BOARD_ID',
  'POSTIZ_PINTEREST_LINK_URL',
] as const;

const TEST_API_KEY = 'postiz-mock-key';

interface ScheduleRequestPost {
  id: string;
  platform: string;
  mediaUrls: string[];
  caption: string;
  hashtags: string[];
  scheduledAt: string;
}

function postPayload(
  platform: ScheduleRequestPost['platform'],
  index: number
): ScheduleRequestPost {
  return {
    id: `sp_${platform}_${index}`,
    platform,
    mediaUrls: [`https://cdn.aether.test/${platform}-${index}.png`],
    caption: 'slow glow key visual',
    hashtags: ['aether', 'launch'],
    scheduledAt: '2026-05-01T12:00:00.000Z',
  };
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/publish/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('postiz sidecar · mock-server integration', () => {
  let mock: PostizMockServer;
  const envSnapshot: Record<string, string | undefined> = {};

  beforeAll(async () => {
    mock = await startPostizMockServer({ apiKeys: [TEST_API_KEY] });
  });

  afterAll(async () => {
    await mock.stop();
  });

  beforeEach(() => {
    mock.reset();
    for (const key of ENV_KEYS) {
      envSnapshot[key] = process.env[key];
    }
    process.env.PUBLISHER_PROVIDER = 'postiz';
    process.env.POSTIZ_API_KEY = TEST_API_KEY;
    process.env.POSTIZ_API_URL = mock.url;
    process.env.POSTIZ_INTEGRATION_INSTAGRAM = 'ig_integration';
    process.env.POSTIZ_INTEGRATION_X = 'x_integration';
    process.env.POSTIZ_INTEGRATION_LINKEDIN = 'li_integration';
    process.env.POSTIZ_INTEGRATION_PINTEREST = 'pin_integration';
    process.env.POSTIZ_PINTEREST_BOARD_ID = 'board_42';
    process.env.POSTIZ_PINTEREST_LINK_URL = 'https://aether.berlayar.ai';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (envSnapshot[key] === undefined) delete process.env[key];
      else process.env[key] = envSnapshot[key];
    }
  });

  it('schedules a 4-platform pack against the mock and lets DELETE cancel one', async () => {
    const { POST } = await import('@/app/api/publish/schedule/route');

    const platforms = ['instagram', 'x', 'linkedin', 'pinterest'] as const;
    const posts = platforms.map((p, i) => postPayload(p, i + 1));

    const res = await POST(
      request({ workspaceId: 'ws_demo', posts, providerId: 'postiz' })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      providerId: string;
      results: Array<{
        platform: string;
        status: string;
        externalId?: string;
      }>;
    };

    expect(body.providerId).toBe('postiz');
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(4);
    expect(body.results.every((r) => r.status === 'scheduled')).toBe(true);

    expect(mock.state.posts).toHaveLength(4);
    expect(mock.state.uploads).toHaveLength(4);
    expect(
      mock.state.posts.map((p) => p.integration).sort()
    ).toEqual(['ig_integration', 'li_integration', 'pin_integration', 'x_integration']);
    expect(
      mock.state.posts.every((p) => p.apiKey === TEST_API_KEY)
    ).toBe(true);

    const externalIds = body.results
      .map((r) => r.externalId)
      .filter((id): id is string => Boolean(id));
    expect(externalIds).toHaveLength(4);

    const target = externalIds[0];
    const deleteRes = await fetch(`${mock.url}/posts/${target}`, {
      method: 'DELETE',
      headers: { Authorization: TEST_API_KEY },
    });
    expect(deleteRes.status).toBe(200);
    await expect(deleteRes.json()).resolves.toMatchObject({
      id: target,
      cancelled: true,
    });

    expect(mock.state.deleted).toContain(target);
    expect(
      mock.state.requests.some(
        (r) => r.method === 'DELETE' && r.path === `/posts/${target}`
      )
    ).toBe(true);

    const listRes = await fetch(`${mock.url}/posts`, {
      headers: { Authorization: TEST_API_KEY },
    });
    const listBody = (await listRes.json()) as Array<{ id: string }>;
    expect(listBody.map((p) => p.id)).not.toContain(target);
    expect(listBody).toHaveLength(3);
  });

  it('rejects calls without a valid Authorization header', async () => {
    const res = await fetch(`${mock.url}/posts`, { method: 'GET' });
    expect(res.status).toBe(401);
  });
});
