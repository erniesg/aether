import { describe, expect, it, vi } from 'vitest';

describe('/api/vibes/keys', () => {
  it('issues a one-time API key for a signed-in user and stores only a prefix in list responses', async () => {
    const { POST, GET } = await import('@/app/api/vibes/keys/route');
    const res = await withDailyLimit(undefined, () =>
      POST(
        new Request('http://localhost/api/vibes/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'user-vibes-key' },
          body: JSON.stringify({ name: 'Test key' }),
        })
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.apiKey).toMatch(/^vibes_vk_/);
    expect(json.key).toMatchObject({
      name: 'Test key',
      status: 'active',
      dailyLimit: 0,
    });

    const list = await GET(
      new Request('http://localhost/api/vibes/keys', {
        headers: { 'x-vibes-dev-user': 'user-vibes-key' },
      })
    );
    const listed = await list.json();
    expect(listed.keys[0]).toMatchObject({ keyPrefix: json.key.keyPrefix });
    expect(JSON.stringify(listed)).not.toContain(json.apiKey);
  });

  it('allows an issued API key to call Vibes plan', async () => {
    await withDailyLimit('1', async () => {
      vi.resetModules();
      const keysRoute = await import('@/app/api/vibes/keys/route');
      const keyRes = await keysRoute.POST(
        new Request('http://localhost/api/vibes/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-vibes-dev-user': 'user-vibes-key-plan' },
          body: JSON.stringify({ name: 'Plan key' }),
        })
      );
      const keyJson = await keyRes.json();

      const { POST } = await import('@/app/api/vibes/plan/route');
      const planRes = await POST(
        new Request('http://localhost/api/vibes/plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keyJson.apiKey}`,
          },
          body: JSON.stringify({ brief: 'Track Acme launch across X and YouTube' }),
        })
      );

      expect(planRes.status).toBe(200);
      expect(await planRes.json()).toMatchObject({ ok: true });
    });
  });
});

async function withDailyLimit<T>(
  value: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const previous = process.env.VIBES_DAILY_CALL_LIMIT;
  if (value === undefined) delete process.env.VIBES_DAILY_CALL_LIMIT;
  else process.env.VIBES_DAILY_CALL_LIMIT = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.VIBES_DAILY_CALL_LIMIT;
    else process.env.VIBES_DAILY_CALL_LIMIT = previous;
  }
}
