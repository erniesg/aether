import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Multi-tool agent loop ledger contract:
 *
 * Every tool dispatch in `runMultiAgent` must write one row to the
 * `capabilityRun` ledger via `lib/convex/http`. The row's `entryRef` must be
 * resolved from the registry (`lib/tool/registry.ts`) so the right rail can
 * group steps by tool. Provider/model attribution is best-known at start
 * time and refined on finish from the route's response payload.
 *
 * These tests mock the Anthropic SDK + `fetch` + the ledger recorders and
 * assert: the recorder is invoked once per tool call with the registry
 * entryRef; the finish patch carries the refined provider/model when the
 * route's response surfaced them.
 */

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn();
  const AnthropicCtor = vi.fn(function () {
    return { messages: { create: messagesCreate } };
  });
  const recordRunStart = vi.fn();
  const recordRunFinish = vi.fn();
  const recordRunFail = vi.fn();
  return {
    messagesCreate,
    AnthropicCtor,
    recordRunStart,
    recordRunFinish,
    recordRunFail,
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: mocks.AnthropicCtor,
}));

vi.mock('@/lib/convex/http', () => ({
  recordRunStart: mocks.recordRunStart,
  recordRunFinish: mocks.recordRunFinish,
  recordRunFail: mocks.recordRunFail,
}));

import { runMultiAgent } from './multi';

function toolUseBlock(name: string, input: unknown) {
  return {
    type: 'tool_use' as const,
    id: `toolu_${name}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    input,
  };
}

function textBlock(text: string) {
  return { type: 'text' as const, text };
}

function fakeMessage(content: Array<{ type: string }>, stop_reason: string) {
  return { content, stop_reason };
}

describe('runMultiAgent · runs ledger provenance', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mocks.messagesCreate.mockReset();
    mocks.recordRunStart.mockReset();
    mocks.recordRunFinish.mockReset();
    mocks.recordRunFail.mockReset();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it('writes start + finish for a successful search_signals tool call with the registry entryRef', async () => {
    mocks.messagesCreate
      .mockResolvedValueOnce(
        fakeMessage(
          [toolUseBlock('search_signals', { seedText: 'streetwear' })],
          'tool_use'
        )
      )
      .mockResolvedValueOnce(
        fakeMessage([textBlock('done — 3 references found')], 'end_turn')
      );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, signalCount: 3, records: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMultiAgent({
      prompt: 'find me streetwear refs',
      baseUrl: 'http://localhost:3000',
      wsId: 'ws_test_123',
    });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ name: 'search_signals', ok: true });
    expect(result.steps[0].clientRunId).toMatch(/^agent_signals-search_/);

    expect(mocks.recordRunStart).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunStart).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 'ws_test_123',
        tool: 'signals-search',
        entryRef: { kind: 'tool', id: 'signals-search', version: 1 },
      })
    );

    expect(mocks.recordRunFinish).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunFinish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'ok' })
    );
    expect(mocks.recordRunFail).not.toHaveBeenCalled();
  });

  it('refines provider/model on finish for analyze_video using the response payload', async () => {
    mocks.messagesCreate
      .mockResolvedValueOnce(
        fakeMessage(
          [
            toolUseBlock('analyze_video', {
              videoUrl: 'https://example.com/v.mp4',
              task: 'summarize',
            }),
          ],
          'tool_use'
        )
      )
      .mockResolvedValueOnce(
        fakeMessage([textBlock('done — short clip described')], 'end_turn')
      );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          provider: 'gemini',
          modelId: 'gemini-2.5-flash-001',
          text: 'a calm urban park…',
        }),
        { status: 200 }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await runMultiAgent({
      prompt: 'describe this clip',
      baseUrl: 'http://localhost:3000',
    });

    expect(mocks.recordRunStart).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'video-understand',
        entryRef: { kind: 'tool', id: 'video-understand', version: 1 },
      })
    );

    const [, finishPatch] = mocks.recordRunFinish.mock.calls[0];
    expect(finishPatch).toMatchObject({
      status: 'ok',
      provider: 'gemini',
      model: 'gemini-2.5-flash-001',
    });
  });

  it('emits recordRunFail with the http status when a tool route returns non-2xx', async () => {
    mocks.messagesCreate
      .mockResolvedValueOnce(
        fakeMessage(
          [toolUseBlock('cluster_references', { images: [] })],
          'tool_use'
        )
      )
      .mockResolvedValueOnce(
        fakeMessage([textBlock('cluster failed; stopping')], 'end_turn')
      );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'no images' }), {
        status: 400,
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMultiAgent({
      prompt: 'cluster these',
      baseUrl: 'http://localhost:3000',
    });

    expect(result.steps[0].ok).toBe(false);
    expect(mocks.recordRunFail).toHaveBeenCalledTimes(1);
    expect(mocks.recordRunFail).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('HTTP 400'),
      400
    );
    expect(mocks.recordRunFinish).not.toHaveBeenCalled();
  });

  it('does not write to the ledger when no tool is called (Claude answered directly)', async () => {
    mocks.messagesCreate.mockResolvedValueOnce(
      fakeMessage([textBlock('I can answer that without tools.')], 'end_turn')
    );

    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runMultiAgent({
      prompt: 'what is 2+2',
      baseUrl: 'http://localhost:3000',
    });

    expect(result.steps).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.recordRunStart).not.toHaveBeenCalled();
    expect(mocks.recordRunFinish).not.toHaveBeenCalled();
    expect(mocks.recordRunFail).not.toHaveBeenCalled();
  });
});
