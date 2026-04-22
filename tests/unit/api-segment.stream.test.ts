import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SegmentStreamEvent } from '@/lib/segment/stream';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZwkmBYAAAAASUVORK5CYII=';

const mocks = vi.hoisted(() => ({
  segment: vi.fn(),
  listProviders: vi.fn(() => [
    {
      id: 'sam3',
      displayName: 'SAM 3 via Modal',
      models: ['sam3.1'],
      supportsTextPrompt: true,
      supportsPointPrompt: true,
      supportsBoxPrompt: true,
      available: true,
    },
  ]),
  resolveProvider: vi.fn(() => ({
    id: 'sam3',
    displayName: 'SAM 3 via Modal',
    supportsTextPrompt: true,
    supportsPointPrompt: true,
    supportsBoxPrompt: true,
    getAvailabilityIssue: () => undefined,
    listModels: () => ['sam3.1'],
    segment: mocks.segment,
  })),
}));

vi.mock('@/lib/providers/segmentation/registry', () => ({
  KNOWN_SEGMENTATION_PROVIDER_IDS: ['sam3', 'sam2'],
  listSegmentationProviders: mocks.listProviders,
  resolveSegmentationProvider: mocks.resolveProvider,
}));

function parseSse(text: string): SegmentStreamEvent[] {
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
    .map((payload) => JSON.parse(payload) as SegmentStreamEvent);
}

describe('/api/segment streaming', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('emits started → progress → completed for a removebg run', async () => {
    mocks.segment.mockResolvedValue({
      provider: 'sam3',
      model: 'sam3.1',
      maskUrl: TINY_PNG,
      width: 1024,
      height: 1024,
      raw: { ok: true },
    });

    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: TINY_PNG,
          mode: 'removebg',
          prompt: 'main subject',
          width: 1024,
          height: 1024,
          runId: 'seg_fixture_1',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = parseSse(await response.text());
    const types = events.map((event) => event.type);

    expect(types[0]).toBe('segment.started');
    expect(types[types.length - 1]).toBe('segment.completed');
    expect(types).toContain('segment.progress');

    const started = events.find((event) => event.type === 'segment.started');
    expect(started).toMatchObject({
      type: 'segment.started',
      runId: 'seg_fixture_1',
      mode: 'prompt',
      verb: 'removebg',
      provider: { id: 'sam3', model: 'sam3.1' },
    });

    const completed = events.find((event) => event.type === 'segment.completed');
    expect(completed).toMatchObject({
      type: 'segment.completed',
      runId: 'seg_fixture_1',
      provider: { id: 'sam3', model: 'sam3.1' },
    });
    if (completed && completed.type === 'segment.completed') {
      expect(completed.outputs.maskUrl).toBe(TINY_PNG);
      expect(completed.outputs.cutoutUrl).toContain('data:image/svg+xml');
      expect(completed.preview.sourceDataUrl).toBe(TINY_PNG);
      expect(completed.preview.cutoutDataUrl).toContain('data:image/svg+xml');
      expect(typeof completed.latencyMs).toBe('number');
    }
  });

  it('categorizes refinement runs as mode=refine and forwards points + box to the provider', async () => {
    mocks.segment.mockResolvedValue({
      provider: 'sam3',
      model: 'sam3.1',
      maskUrl: TINY_PNG,
      width: 1024,
      height: 1024,
    });

    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: TINY_PNG,
          mode: 'cutout',
          points: [
            { x: 120, y: 180, label: 'fg' },
            { x: 12, y: 24, label: 'bg' },
          ],
          box: { x: 40, y: 60, w: 320, h: 400 },
          width: 1024,
          height: 1024,
          runId: 'seg_fixture_2',
        }),
      })
    );

    const events = parseSse(await response.text());
    const started = events.find((event) => event.type === 'segment.started');
    expect(started).toMatchObject({
      mode: 'refine',
      verb: 'cutout',
    });

    expect(mocks.segment).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [
          { x: 120, y: 180, label: 'fg' },
          { x: 12, y: 24, label: 'bg' },
        ],
        box: { x: 40, y: 60, w: 320, h: 400 },
      }),
      expect.any(Object)
    );
  });

  it('emits segment.failed when the provider throws a SegmentationError', async () => {
    const { SegmentationError } = await import('@/lib/providers/segmentation/types');
    mocks.segment.mockRejectedValue(new SegmentationError('upstream boom', 'sam3'));

    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: TINY_PNG,
          mode: 'removebg',
          width: 1024,
          height: 1024,
          runId: 'seg_fixture_3',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = parseSse(await response.text());
    const failed = events.find((event) => event.type === 'segment.failed');
    expect(failed).toMatchObject({
      type: 'segment.failed',
      runId: 'seg_fixture_3',
      code: 'segmentation_failed',
    });
    if (failed && failed.type === 'segment.failed') {
      expect(failed.error).toContain('upstream boom');
    }
    expect(events.some((event) => event.type === 'segment.completed')).toBe(false);
  });

  it('emits segment.failed with provider list when the provider is unavailable', async () => {
    const { SegmentationUnavailableError } = await import(
      '@/lib/providers/segmentation/types'
    );
    mocks.resolveProvider.mockImplementationOnce(() => {
      throw new SegmentationUnavailableError('sam3', 'SAM 3 is not connected');
    });

    const { POST } = await import('@/app/api/segment/route');
    const response = await POST(
      new Request('http://localhost/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'sam3',
          sourceUrl: TINY_PNG,
          mode: 'removebg',
          width: 1024,
          height: 1024,
          runId: 'seg_fixture_4',
        }),
      })
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = parseSse(await response.text());
    const failed = events.find((event) => event.type === 'segment.failed');
    expect(failed).toMatchObject({
      type: 'segment.failed',
      code: 'provider_unavailable',
    });
    if (failed && failed.type === 'segment.failed') {
      expect(Array.isArray(failed.providers)).toBe(true);
    }
  });
});

describe('readSegmentStream', () => {
  it('parses queued → running → ok transitions dispatched from a mock SSE body', async () => {
    const { readSegmentStream, encodeSegmentEvent } = await import('@/lib/segment/stream');

    const events: SegmentStreamEvent[] = [
      {
        type: 'segment.started',
        at: 1,
        runId: 'r1',
        provider: { id: 'sam3', model: 'sam3.1' },
        mode: 'removebg',
        verb: 'removebg',
      },
      { type: 'segment.progress', at: 2, runId: 'r1', phase: 'inference' },
      { type: 'segment.progress', at: 3, runId: 'r1', phase: 'postprocess' },
      {
        type: 'segment.completed',
        at: 4,
        runId: 'r1',
        provider: { id: 'sam3', model: 'sam3.1' },
        latencyMs: 1234,
        outputs: { maskUrl: TINY_PNG, cutoutUrl: TINY_PNG },
        preview: {
          sourceDataUrl: TINY_PNG,
          maskDataUrl: TINY_PNG,
          cutoutDataUrl: TINY_PNG,
          width: 100,
          height: 100,
        },
      },
    ];

    const encoded = events.map((event) => encodeSegmentEvent(event));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of encoded) controller.enqueue(chunk);
        controller.close();
      },
    });

    const transitions: Array<'queued' | 'running' | 'ok' | 'error'> = ['queued'];
    await readSegmentStream(new Response(body), (event) => {
      if (event.type === 'segment.started') transitions.push('running');
      if (event.type === 'segment.completed') transitions.push('ok');
      if (event.type === 'segment.failed') transitions.push('error');
    });

    expect(transitions).toEqual(['queued', 'running', 'ok']);
  });

  it('handles chunks split mid-event boundary', async () => {
    const { readSegmentStream, encodeSegmentEvent } = await import('@/lib/segment/stream');

    const fullBytes = new Uint8Array(
      Buffer.concat([
        Buffer.from(
          encodeSegmentEvent({
            type: 'segment.started',
            at: 1,
            runId: 'r1',
            provider: { id: 'sam3', model: 'sam3.1' },
            mode: 'removebg',
            verb: 'removebg',
          })
        ),
        Buffer.from(
          encodeSegmentEvent({
            type: 'segment.failed',
            at: 2,
            runId: 'r1',
            error: 'boom',
          })
        ),
      ])
    );

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const mid = Math.floor(fullBytes.length / 2);
        controller.enqueue(fullBytes.slice(0, mid));
        controller.enqueue(fullBytes.slice(mid));
        controller.close();
      },
    });

    const received: string[] = [];
    await readSegmentStream(new Response(body), (event) => {
      received.push(event.type);
    });

    expect(received).toEqual(['segment.started', 'segment.failed']);
  });
});
