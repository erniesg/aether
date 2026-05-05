import { afterEach, describe, expect, it, vi } from 'vitest';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const mocks = vi.hoisted(() => ({
  planGenerate: vi.fn(),
  providerGenerate: vi.fn(),
  fallbackProviderGenerate: vi.fn(),
  availableProviderIds: ['openai'] as string[],
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
  listAvailableProviders: () =>
    mocks.availableProviderIds.map((id) =>
      id === 'gemini'
        ? {
            id: 'gemini',
            displayName: 'Google Imagen / Gemini Image',
            models: ['imagen-4.0-fast-generate-001'],
          }
        : {
            id: 'openai',
            displayName: 'OpenAI Images',
            models: ['gpt-image-1'],
          }
    ),
  resolveProvider: (preferredId?: string) =>
    preferredId === 'gemini'
      ? {
          id: 'gemini',
          displayName: 'Google Imagen / Gemini Image',
          listModels: () => ['imagen-4.0-fast-generate-001'],
          generate: mocks.fallbackProviderGenerate,
        }
      : {
          id: 'openai',
          displayName: 'OpenAI Images',
          listModels: () => ['gpt-image-1'],
          generate: mocks.providerGenerate,
        },
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

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
  intervalMs = 5
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  expect(predicate()).toBe(true);
}

function makeImageResult(aspectRatio: string, latencyMs = 100) {
  return {
    provider: 'openai',
    model: 'gpt-image-1',
    latencyMs,
    images: [
      {
        url: TINY_PNG,
        width: aspectRatio === '16:9' ? 2048 : 1024,
        height: aspectRatio === '16:9' ? 1152 : 1024,
        mimeType: 'image/png',
      },
    ],
  };
}

describe('/api/generate streaming', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.availableProviderIds = ['openai'];
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

  it('streams per-frame progress when the request fans out to multiple artboards (mode=fanout explicit)', async () => {
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
          mode: 'fanout',
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

  it('falls through to another configured image provider when auto routing hits a provider error', async () => {
    mocks.availableProviderIds = ['openai', 'gemini'];
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'fallback launch visual',
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
    mocks.providerGenerate.mockRejectedValue(
      new Error('Billing hard limit has been reached.')
    );
    mocks.fallbackProviderGenerate.mockResolvedValue({
      provider: 'gemini',
      model: 'imagen-4.0-fast-generate-001',
      latencyMs: 900,
      images: [
        {
          url: TINY_PNG,
          width: 1024,
          height: 1024,
          mimeType: 'image/png',
        },
      ],
    });

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a launch still life',
          bypassAgent: true,
          allowProviderFallback: true,
        }),
      })
    );

    const events = parseSse(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'plan.ready',
      'frame.started',
      'frame.failed',
      'frame.started',
      'frame.completed',
      'run.completed',
    ]);
    expect(events[3]).toMatchObject({
      type: 'frame.failed',
      provider: { id: 'openai' },
      error: 'Billing hard limit has been reached.',
    });
    expect(events[5]).toMatchObject({
      type: 'frame.completed',
      provider: {
        id: 'gemini',
        model: 'imagen-4.0-fast-generate-001',
      },
    });
    expect(events[6]).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      provider: {
        id: 'gemini',
        model: 'imagen-4.0-fast-generate-001',
      },
      frames: {
        total: 1,
        completed: 1,
        failed: 0,
      },
    });
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.fallbackProviderGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not cross-fallback to another image provider unless explicitly requested', async () => {
    mocks.availableProviderIds = ['openai', 'gemini'];
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'no drift launch visual',
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
    mocks.providerGenerate.mockRejectedValue(new Error('primary unavailable'));

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a launch still life',
          bypassAgent: true,
        }),
      })
    );

    const events = parseSse(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'plan.ready',
      'frame.started',
      'frame.failed',
      'run.completed',
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      status: 'error',
      frames: {
        total: 1,
        completed: 0,
        failed: 1,
      },
    });
    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.fallbackProviderGenerate).not.toHaveBeenCalled();
  });

  it('passes resolved visual-composition policy from the HTTP request to the provider', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'visual only campaign still',
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
    mocks.providerGenerate.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 1200,
      images: [
        {
          url: TINY_PNG,
          width: 1024,
          height: 1024,
          mimeType: 'image/png',
        },
      ],
    });

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a visual-only campaign still',
          bypassAgent: true,
          composition: {
            textStrategy: 'none',
            constraints: ['no-signatures', 'not-yet-known'],
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await response.text();

    expect(mocks.providerGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.providerGenerate.mock.calls[0][0]).toMatchObject({
      prompt: 'visual only campaign still',
      aspectRatio: '1:1',
      composition: {
        textStrategy: 'none',
        constraints: ['no-signatures'],
      },
    });
  });

  it('hero-seeded fanout uses the generated hero as child ref instead of all selected refs', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'premium sleep system launch visual',
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
    mocks.providerGenerate.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 100,
      images: [
        {
          url: TINY_PNG,
          width: 1024,
          height: 1024,
          mimeType: 'image/png',
        },
      ],
    });

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a sleep campaign',
          bypassAgent: true,
          mode: 'hero-seeded-fanout',
          refs: [{ url: 'https://refs.test/product.png' }, { url: 'https://refs.test/scene.png' }],
          targets: [
            { id: 'frame_square', label: 'Square', aspectRatio: '1:1' },
            { id: 'frame_post', label: 'IG Portrait', aspectRatio: '4:5' },
            { id: 'frame_story', label: 'Story', aspectRatio: '9:16' },
            { id: 'frame_wide', label: 'X / LinkedIn', aspectRatio: '16:9' },
          ],
        }),
      })
    );

    const events = parseSse(await response.text());
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      mode: 'hero-seeded-fanout',
      status: 'ok',
      heroDirections: [
        expect.objectContaining({
          id: 'hero-a',
          label: 'Intimate Product Moment',
        }),
      ],
    });

    expect(mocks.providerGenerate).toHaveBeenCalledTimes(4);
    const calls = mocks.providerGenerate.mock.calls.map(([req]) => req as {
      prompt: string;
      refs?: Array<{ url: string; weight?: number }>;
      aspectRatio: string;
    });
    expect(calls[0]!.prompt).toContain(
      'Use selected references when relevant. Keep raster free of baked text so editable overlays carry copy.'
    );
    expect(calls[0]!.prompt).toContain('Create one continuous image, not a collage.');
    expect(calls[0]!.refs?.map((ref) => ref.url)).toEqual([
      'https://refs.test/product.png',
      'https://refs.test/scene.png',
    ]);
    for (const child of calls.slice(1)) {
      expect(child.prompt).toContain(
        'Use the attached hero as the single scene to adapt. Create one continuous photograph, not a collage.'
      );
      expect(child.prompt).toContain(
        'No grid, panels, inset images, contact sheet, split-screen, or montage.'
      );
      expect(child.refs?.map((ref) => ref.url)).toEqual([TINY_PNG]);
    }
  });

  it('hero-seeded fanout can plan multiple distinct hero directions', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'multi-direction sleep launch',
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
    mocks.providerGenerate.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 100,
      images: [
        {
          url: TINY_PNG,
          width: 1024,
          height: 1024,
          mimeType: 'image/png',
        },
      ],
    });

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a sleep campaign',
          bypassAgent: true,
          mode: 'hero-seeded-fanout',
          heroCount: 2,
          targets: [
            { id: 'frame_square', label: 'Square', aspectRatio: '1:1' },
            { id: 'frame_wide', label: 'X / LinkedIn', aspectRatio: '16:9' },
          ],
        }),
      })
    );

    const events = parseSse(await response.text());
    const completed = events.filter((event) => event.type === 'frame.completed');
    expect(completed).toHaveLength(4);
    expect(
      completed
        .map((event) => (event.frame as { heroDirectionId?: string }).heroDirectionId)
        .sort()
    ).toEqual(['hero-a', 'hero-a', 'hero-b', 'hero-b']);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      mode: 'hero-seeded-fanout',
      heroDirections: [
        expect.objectContaining({ id: 'hero-a', label: 'Intimate Product Moment' }),
        expect.objectContaining({ id: 'hero-b', label: 'Premium Material Closeup' }),
      ],
      nativePerFormatUrlsByHero: {
        'hero-a': expect.objectContaining({ '1x1': TINY_PNG, '16x9': TINY_PNG }),
        'hero-b': expect.objectContaining({ '1x1': TINY_PNG, '16x9': TINY_PNG }),
      },
    });
  });

  it('starts multi-hero seed variations in parallel before waiting for child formats', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'parallel multi-direction sleep launch',
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

    const deferred: Array<{
      aspectRatio: string;
      resolve: (value: ReturnType<typeof makeImageResult>) => void;
    }> = [];
    mocks.providerGenerate.mockImplementation((req: { aspectRatio: string }) => {
      let resolve!: (value: ReturnType<typeof makeImageResult>) => void;
      const promise = new Promise<ReturnType<typeof makeImageResult>>((done) => {
        resolve = done;
      });
      deferred.push({ aspectRatio: req.aspectRatio, resolve });
      return promise;
    });

    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a sleep campaign',
          bypassAgent: true,
          mode: 'hero-seeded-fanout',
          heroCount: 2,
          targets: [
            { id: 'frame_square', label: 'Square', aspectRatio: '1:1' },
            { id: 'frame_wide', label: 'X / LinkedIn', aspectRatio: '16:9' },
          ],
        }),
      })
    );

    const textPromise = response.text();
    await waitFor(() => mocks.providerGenerate.mock.calls.length === 2);
    expect(mocks.providerGenerate.mock.calls.slice(0, 2).map(([req]) => req.aspectRatio)).toEqual([
      '1:1',
      '1:1',
    ]);

    deferred[0]!.resolve(makeImageResult('1:1'));
    deferred[1]!.resolve(makeImageResult('1:1'));
    await waitFor(() => mocks.providerGenerate.mock.calls.length === 4);
    expect(mocks.providerGenerate.mock.calls.slice(2).map(([req]) => req.aspectRatio)).toEqual([
      '16:9',
      '16:9',
    ]);

    deferred[2]!.resolve(makeImageResult('16:9'));
    deferred[3]!.resolve(makeImageResult('16:9'));

    const events = parseSse(await textPromise);
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      status: 'ok',
      mode: 'hero-seeded-fanout',
      frames: {
        total: 4,
        completed: 4,
        failed: 0,
      },
    });
  });

  it('closes the generate stream when one provider frame exceeds the frame timeout', async () => {
    const previousTimeout = process.env.AETHER_IMAGE_FRAME_TIMEOUT_MS;
    const previousRetries = process.env.AETHER_IMAGE_PROVIDER_RETRIES;
    process.env.AETHER_IMAGE_FRAME_TIMEOUT_MS = '20';
    process.env.AETHER_IMAGE_PROVIDER_RETRIES = '1';

    try {
      mocks.planGenerate.mockResolvedValue({
        plan: {
          rewrittenPrompt: 'slow provider launch visual',
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
      mocks.providerGenerate.mockImplementation(() => new Promise(() => {}));

      const { POST } = await import('@/app/api/generate/route');
      const response = await POST(
        new Request('http://localhost/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'make a launch still life',
            bypassAgent: true,
          }),
        })
      );

      const events = parseSse(await response.text());
      expect(events.map((event) => event.type)).toEqual([
        'run.started',
        'plan.ready',
        'frame.started',
        'frame.failed',
        'run.completed',
      ]);
      expect(events[3]).toMatchObject({
        type: 'frame.failed',
        code: 'image_gen_timeout',
      });
      expect(String(events[3]!.error)).toContain('timed out after');
      expect(events.at(-1)).toMatchObject({
        type: 'run.completed',
        status: 'error',
        frames: {
          total: 1,
          completed: 0,
          failed: 1,
        },
      });
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.AETHER_IMAGE_FRAME_TIMEOUT_MS;
      } else {
        process.env.AETHER_IMAGE_FRAME_TIMEOUT_MS = previousTimeout;
      }
      if (previousRetries === undefined) {
        delete process.env.AETHER_IMAGE_PROVIDER_RETRIES;
      } else {
        process.env.AETHER_IMAGE_PROVIDER_RETRIES = previousRetries;
      }
    }
  });

  it('applies the system visual-composition default when request composition is omitted', async () => {
    mocks.planGenerate.mockResolvedValue({
      plan: {
        rewrittenPrompt: 'default visual policy still',
        aspectRatio: '4:5',
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
    mocks.providerGenerate.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-image-1',
      latencyMs: 1200,
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
        body: JSON.stringify({
          prompt: 'make a campaign still',
          bypassAgent: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    await response.text();

    expect(mocks.providerGenerate.mock.calls[0][0]).toMatchObject({
      composition: {
        textStrategy: 'none',
        constraints: ['no-signatures', 'no-watermarks'],
      },
    });
  });

  it('rejects invalid composition payloads before planning', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const response = await POST(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'make a campaign still',
          composition: {
            textStrategy: 'posterize',
          },
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'composition.textStrategy is invalid',
    });
    expect(mocks.planGenerate).not.toHaveBeenCalled();
    expect(mocks.providerGenerate).not.toHaveBeenCalled();
  });
});
