import { afterEach, describe, expect, it, vi } from 'vitest';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const mocks = vi.hoisted(() => ({
  planGenerate: vi.fn(),
  providerGenerate: vi.fn(),
  recordRunStart: vi.fn(),
  recordRunFinish: vi.fn(),
  recordRunFail: vi.fn(),
}));

vi.mock('@/lib/agent/generate', () => ({
  CLAUDE_MODEL: 'claude-opus-4-7',
  planGenerate: mocks.planGenerate,
  runGenerate: vi.fn(),
}));

vi.mock('@/lib/providers/image/registry', () => ({
  listAvailableProviders: () => ['openai'],
  resolveProvider: () => ({
    id: 'openai',
    displayName: 'OpenAI Images',
    listModels: () => ['gpt-image-1'],
    generate: mocks.providerGenerate,
  }),
}));

vi.mock('@/lib/convex/http', () => ({
  recordRunStart: mocks.recordRunStart,
  recordRunFinish: mocks.recordRunFinish,
  recordRunFail: mocks.recordRunFail,
}));

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split(/\n\n+/)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
    )
    .filter(Boolean)
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

describe('/api/generate streaming', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('streams real planner and provider events for a single render', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'fixture rewritten prompt',
        aspectRatio: '4:5',
        rationale: 'fixture rationale',
      },
      provider: {
        id: 'openai',
        displayName: 'OpenAI Images',
        model: 'gpt-image-1',
      },
      debug: {
        plannerMode: 'anthropic',
        plannerModel: 'claude-opus-4-7',
        toolCall: {
          name: 'generate_image',
          prompt: 'fixture rewritten prompt',
          aspectRatio: '4:5',
          rationale: 'fixture rationale',
        },
      },
    });
    mocks.providerGenerate.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 4200,
      images: [
        {
          url: TINY_PNG,
          width: 1024,
          height: 1280,
          mimeType: 'image/png',
        },
      ],
    });

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'make a launch still life' }),
      })
    );

    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = parseSse(await response.text());

    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'planner.started',
      'plan.ready',
      'frame.started',
      'frame.completed',
      'run.completed',
    ]);
    expect(events[2]).toMatchObject({
      type: 'plan.ready',
      plannerMode: 'anthropic',
      plannerModel: 'claude-opus-4-7',
      rewrittenPrompt: 'fixture rewritten prompt',
      aspectRatio: '4:5',
      toolCall: {
        name: 'generate_image',
        prompt: 'fixture rewritten prompt',
        aspectRatio: '4:5',
      },
    });
    expect(events[3]).toMatchObject({
      type: 'frame.started',
      frame: {
        id: 'canvas',
        index: 1,
        total: 1,
        aspectRatio: '4:5',
      },
      provider: {
        id: 'openai',
        model: 'gpt-image-1',
      },
    });
    expect(events[4]).toMatchObject({
      type: 'frame.completed',
      frame: {
        id: 'canvas',
        index: 1,
        total: 1,
      },
      image: {
        url: TINY_PNG,
        width: 1024,
        height: 1280,
      },
    });
    expect(events[5]).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      frames: {
        total: 1,
        completed: 1,
        failed: 0,
      },
    });
  });

  it('streams per-frame progress when the request fans out to multiple artboards', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'shared launch visual',
        aspectRatio: '1:1',
      },
      provider: {
        id: 'openai',
        displayName: 'OpenAI Images',
        model: 'gpt-image-1',
      },
      debug: {
        plannerMode: 'bypass',
      },
    });
    mocks.providerGenerate.mockImplementation(async (req: { aspectRatio: string }) => ({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: req.aspectRatio === '4:5' ? 1800 : 2400,
      images: [
        {
          url: TINY_PNG,
          width: req.aspectRatio === '4:5' ? 1024 : 1024,
          height: req.aspectRatio === '4:5' ? 1280 : 1792,
          mimeType: 'image/png',
        },
      ],
    }));

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'fan this out',
          bypassAgent: true,
          targets: [
            { id: 'frame_ig_post', label: 'IG Post', aspectRatio: '4:5' },
            { id: 'frame_story', label: 'Story', aspectRatio: '9:16' },
          ],
        }),
      })
    );

    const events = parseSse(await response.text());
    const started = events.filter((event) => event.type === 'frame.started');
    const completed = events.filter((event) => event.type === 'frame.completed');

    expect(started).toHaveLength(2);
    expect(completed).toHaveLength(2);
    expect(started[0]).toMatchObject({
      frame: { id: 'frame_ig_post', label: 'IG Post', index: 1, total: 2, aspectRatio: '4:5' },
    });
    expect(started[1]).toMatchObject({
      frame: { id: 'frame_story', label: 'Story', index: 2, total: 2, aspectRatio: '9:16' },
    });
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      frames: {
        total: 2,
        completed: 2,
        failed: 0,
      },
    });
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(2);
    expect(
      mocks.providerGenerate.mock.calls.map(([req]) => ({
        prompt: req.prompt,
        aspectRatio: req.aspectRatio,
      }))
    ).toEqual([
      { prompt: 'shared launch visual', aspectRatio: '4:5' },
      { prompt: 'shared launch visual', aspectRatio: '9:16' },
    ]);
  });
});
