import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runGenerate: vi.fn(),
  recordRunStart: vi.fn(),
  recordRunFinish: vi.fn(),
  recordRunFail: vi.fn(),
}));

vi.mock('@/lib/agent/generate', () => ({
  runGenerate: mocks.runGenerate,
}));

vi.mock('@/lib/convex/http', () => ({
  recordRunStart: mocks.recordRunStart,
  recordRunFinish: mocks.recordRunFinish,
  recordRunFail: mocks.recordRunFail,
}));

describe('/api/capability/rerun', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('records typed entry provenance when rerunning a capability definition', async () => {
    mocks.runGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'rerun prompt',
        aspectRatio: '1:1',
      },
      provider: {
        id: 'openai',
        displayName: 'OpenAI Images',
        model: 'gpt-image-1',
      },
      result: {
        latencyMs: 3200,
        images: [
          {
            url: 'https://cdn.test/rerun.png',
            width: 1024,
            height: 1024,
            mimeType: 'image/png',
          },
        ],
      },
    });

    const { POST } = await import('@/app/api/capability/rerun/route');
    const response = await POST(
      new Request('http://localhost/api/capability/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: 'run_cap_rerun',
          definition: {
            id: 'cap_hero',
            version: 4,
            createdAt: 1,
            name: 'hero image draft',
            trigger: 'make the selected layer a hero image',
            paramSchema: { type: 'object', properties: { layerId: { type: 'string' } } },
            createdBy: 'agent',
            tool: 'image-gen',
            provider: 'auto',
            entryRef: {
              kind: 'tool',
              id: 'image-gen',
              version: 1,
            },
            runTemplate: {
              prompt: 'hero prompt',
              providerId: 'openai',
              model: 'gpt-image-1',
              aspectRatio: '1:1',
            },
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.runGenerate).toHaveBeenCalledWith({
      prompt: 'hero prompt',
      providerId: 'openai',
      model: 'gpt-image-1',
      bypassAgent: false,
    });
    expect(mocks.recordRunStart).toHaveBeenCalledWith({
      clientRunId: 'run_cap_rerun',
      tool: 'image-gen',
      provider: 'openai',
      model: 'gpt-image-1',
      prompt: 'hero prompt',
      aspectRatio: '1:1',
      definitionId: 'cap_hero',
      definitionVersion: 4,
      entryRef: {
        kind: 'tool',
        id: 'image-gen',
        version: 1,
      },
    });
    expect(mocks.recordRunFinish).toHaveBeenCalledWith('run_cap_rerun', {
      provider: 'openai',
      model: 'gpt-image-1',
      rewrittenPrompt: 'rerun prompt',
      aspectRatio: '1:1',
      imageUrl: 'https://cdn.test/rerun.png',
      latencyMs: 3200,
    });

    expect(await response.json()).toMatchObject({
      ok: true,
      definitionId: 'cap_hero',
      definitionVersion: 4,
      entryRef: {
        kind: 'tool',
        id: 'image-gen',
        version: 1,
      },
    });
  });

  it('falls back to the legacy tool field when older definitions have no entryRef yet', async () => {
    mocks.runGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'legacy rerun prompt',
        aspectRatio: '4:5',
      },
      provider: {
        id: 'gemini',
        displayName: 'Gemini',
        model: 'nano-banana',
      },
      result: {
        latencyMs: 800,
        images: [],
      },
    });

    const { POST } = await import('@/app/api/capability/rerun/route');
    const response = await POST(
      new Request('http://localhost/api/capability/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          definition: {
            id: 'cap_legacy',
            version: 1,
            createdAt: 1,
            name: 'legacy image capability',
            trigger: 'rerun the image capability',
            paramSchema: { type: 'object', properties: { layerId: { type: 'string' } } },
            createdBy: 'agent',
            tool: 'image-gen',
            provider: 'auto',
            runTemplate: {
              prompt: 'legacy prompt',
            },
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      entryRef: {
        kind: 'tool',
        id: 'image-gen',
        version: 1,
      },
    });
  });
});
