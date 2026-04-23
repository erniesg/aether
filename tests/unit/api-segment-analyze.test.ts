import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  resolveProvider: vi.fn(() => ({
    id: 'openai',
    displayName: 'OpenAI Vision',
    listModels: () => ['gpt-4.1-mini'],
    isAvailable: () => true,
    analyze: mocks.analyze,
  })),
}));

vi.mock('@/lib/providers/vision/registry', () => ({
  KNOWN_VISION_PROVIDER_IDS: ['openai'],
  resolveVisionProvider: mocks.resolveProvider,
}));

describe('/api/segment/analyze', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a normalized element inventory', async () => {
    mocks.analyze.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inventory: {
        summary:
          'A marble bust with exposed brain, a robotic hand, a wireframe hand, and floating glitch blocks.',
        elements: [
          {
            id: 'head',
            label: 'marble bust head',
            prompt: 'marble bust head',
            prominence: 'primary',
          },
          {
            id: 'brain',
            label: 'exposed brain',
            prompt: 'exposed brain',
            prominence: 'primary',
          },
        ],
      },
      raw: { ok: true },
    });

    const { POST } = await import('@/app/api/segment/analyze/route');
    const response = await POST(
      new Request('http://localhost/api/segment/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: 'data:image/png;base64,aaa',
        }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.provider).toEqual({ id: 'openai', model: 'gpt-4.1-mini' });
    expect(json.inventory.summary).toMatch(/marble bust/i);
    expect(json.inventory.elements).toHaveLength(2);
    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'data:image/png;base64,aaa',
        maxElements: 6,
      }),
      { model: 'gpt-4.1-mini' }
    );
  });

  it('rejects requests without a source image', async () => {
    const { POST } = await import('@/app/api/segment/analyze/route');
    const response = await POST(
      new Request('http://localhost/api/segment/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: 'sourceUrl is required',
    });
  });
});
