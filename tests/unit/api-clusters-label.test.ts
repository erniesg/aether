import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const messagesCreate = vi.fn();
  const AnthropicCtor = vi.fn(function () {
    return { messages: { create: messagesCreate } };
  });
  return { messagesCreate, AnthropicCtor };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: mocks.AnthropicCtor,
}));

describe('/api/clusters/label', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    mocks.messagesCreate.mockReset();
    mocks.AnthropicCtor.mockClear();
    process.env.ANTHROPIC_API_KEY = 'ant_test';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    vi.resetModules();
  });

  it('returns 400 when clusters is missing / wrong shape', async () => {
    const { POST } = await import('@/app/api/clusters/label/route');
    const res = await POST(
      new Request('http://localhost/api/clusters/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusters: 'not-an-array' }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/clusters/i);
  });

  it('returns an empty label list for an empty cluster array without hitting Claude', async () => {
    const { POST } = await import('@/app/api/clusters/label/route');
    const res = await POST(
      new Request('http://localhost/api/clusters/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusters: [] }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.labels).toEqual([]);
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });

  it('falls back to deterministic labels when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { POST } = await import('@/app/api/clusters/label/route');
    const res = await POST(
      new Request('http://localhost/api/clusters/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{ clusterId: '0' }, { clusterId: '1' }],
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.fallback).toBe('no-api-key');
    expect(json.labels).toEqual([
      { clusterId: '0', label: 'direction 0' },
      { clusterId: '1', label: 'direction 1' },
    ]);
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });

  it('calls Claude with an emit_labels tool-use, normalises labels, returns one per cluster', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_labels',
          id: 'tu_1',
          input: {
            labels: [
              { clusterId: '0', label: '  Slow Morning Light. ' },
              { clusterId: '1', label: 'raw desert tone noise extra words' },
            ],
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/clusters/label/route');
    const res = await POST(
      new Request('http://localhost/api/clusters/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [
            { clusterId: '0', samples: ['pinterest', 'pinterest'] },
            { clusterId: '1', samples: ['xhs', 'tiktok'] },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.labels).toEqual([
      { clusterId: '0', label: 'slow morning light' },
      { clusterId: '1', label: 'raw desert tone' },
    ]);

    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1);
    const call = mocks.messagesCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'emit_labels' });
    expect(call.tools[0].name).toBe('emit_labels');
  });

  it('fills missing cluster ids with fallback labels so every input gets a reply', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'emit_labels',
          id: 'tu_1',
          input: {
            labels: [{ clusterId: '0', label: 'clean minimal' }],
          },
        },
      ],
    });

    const { POST } = await import('@/app/api/clusters/label/route');
    const res = await POST(
      new Request('http://localhost/api/clusters/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusters: [{ clusterId: '0' }, { clusterId: '7' }],
        }),
      })
    );
    const json = await res.json();
    expect(json.labels).toEqual([
      { clusterId: '0', label: 'clean minimal' },
      { clusterId: '7', label: 'direction 7' },
    ]);
  });

  it('falls back gracefully when Claude raises an auth error (demo stays up)', async () => {
    mocks.messagesCreate.mockRejectedValueOnce(new Error('authentication_error · invalid api key'));
    const { POST } = await import('@/app/api/clusters/label/route');
    const res = await POST(
      new Request('http://localhost/api/clusters/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusters: [{ clusterId: '0' }] }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.fallback).toBe('anthropic-error');
    expect(json.labels).toEqual([{ clusterId: '0', label: 'direction 0' }]);
  });
});
