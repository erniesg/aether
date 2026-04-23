import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  proposeCampaign: vi.fn(),
}));

vi.mock('@/lib/campaigns/propose', () => ({
  proposeCampaign: mocks.proposeCampaign,
}));

describe('/api/campaigns/propose', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.proposeCampaign.mockReset();
  });

  it('returns { ok, proposal } for a valid request', async () => {
    mocks.proposeCampaign.mockResolvedValueOnce({
      name: 'Spring Reset Launch',
      intent: 'Introduce the Spring Reset Duo with a slow-morning, golden-hour mood.',
      formats: ['ig-post', 'story', 'reel-cover', 'linkedin-landscape'],
      tone: ['slow', 'certain', 'golden-hour'],
      briefBody:
        'Launch the Spring Reset Duo across feed, story, reel cover, and LinkedIn. Lead with barrier repair. Keep the key visual cohesive.',
    });

    const { POST } = await import('@/app/api/campaigns/propose/route');
    const res = await POST(
      new Request('http://localhost/api/campaigns/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandSnapshot: {
            palette: [{ hex: '#0f1013', role: 'primary' }],
            typography: [{ family: 'Canela Deck', role: 'display' }],
            voice: { samples: ['slow, certain skincare'] },
            logos: [],
            productImages: [],
            confidence: 0.7,
            source: { kind: 'url', url: 'https://solsticeskin.com' },
          },
          offerSnapshot: {
            name: 'Spring Reset Duo',
            summary: 'barrier repair + golden-hour glow',
            claims: ['ceramide cleanse', 'niacinamide glow'],
          },
          signals: [
            { title: 'Golden-hour product', platform: 'Instagram', lift: '+124%' },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.proposal.name).toBe('Spring Reset Launch');
    expect(json.proposal.formats).toEqual([
      'ig-post',
      'story',
      'reel-cover',
      'linkedin-landscape',
    ]);
    expect(json.proposal.tone).toContain('slow');
    expect(json.proposal.briefBody).toMatch(/Spring Reset Duo/);

    expect(mocks.proposeCampaign).toHaveBeenCalledTimes(1);
    expect(mocks.proposeCampaign).toHaveBeenCalledWith(
      {
        brandSnapshot: expect.objectContaining({
          palette: [{ hex: '#0f1013', role: 'primary' }],
        }),
        offerSnapshot: expect.objectContaining({ name: 'Spring Reset Duo' }),
        signals: [
          { title: 'Golden-hour product', platform: 'Instagram', lift: '+124%' },
        ],
      },
      { bypassAgent: false }
    );
  });

  it('passes bypassAgent through to the shaper when set', async () => {
    mocks.proposeCampaign.mockResolvedValueOnce({
      name: 'launch',
      intent: 'Introduce the offer.',
      formats: ['ig-post'],
      tone: ['on-brand'],
      briefBody: 'Launch across feed.',
    });

    const { POST } = await import('@/app/api/campaigns/propose/route');
    await POST(
      new Request('http://localhost/api/campaigns/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerSnapshot: { name: 'Thing' },
          bypassAgent: true,
        }),
      })
    );

    expect(mocks.proposeCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ offerSnapshot: expect.objectContaining({ name: 'Thing' }) }),
      { bypassAgent: true }
    );
  });

  it('rejects non-JSON bodies with 400', async () => {
    const { POST } = await import('@/app/api/campaigns/propose/route');
    const res = await POST(
      new Request('http://localhost/api/campaigns/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/invalid JSON/);
  });

  it('returns 500 when the shaper throws an unexpected error', async () => {
    mocks.proposeCampaign.mockRejectedValueOnce(new Error('upstream exploded'));
    const { POST } = await import('@/app/api/campaigns/propose/route');
    const res = await POST(
      new Request('http://localhost/api/campaigns/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerSnapshot: { name: 'Thing' } }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/upstream exploded/);
  });
});
