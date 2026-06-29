import { describe, expect, it, vi } from 'vitest';
import { createAnthropicMotionSourceAuthorProvider } from '@/lib/providers/source-author/anthropic';
import type { MotionSourceAuthorRequest } from '@/lib/providers/source-author/types';

function request(): MotionSourceAuthorRequest {
  return {
    id: 'author-source-patch-1',
    status: 'ready',
    route: '/api/motion/source-edit',
    method: 'POST',
    sourceEditId: 'source-edit-1',
    sourcePatchPlanId: 'source-patch-1',
    variantId: 'caption-first',
    label: 'Caption-led variation',
    prompt: 'Make the demo beat sharper and sync the caption to the reveal.',
    sourceFiles: [
      {
        path: 'timeline/draft-primary.json',
        contents: JSON.stringify({
          id: 'draft-primary',
          tracks: [{ id: 'track-text', clips: [] }],
        }),
      },
      {
        path: 'STORYBOARD.md',
        contents: '# Storyboard\n\nExisting beat.',
      },
    ],
    targetClipIds: ['clip-beat-demo-text'],
    requestTemplate: {
      project: '$motionProject',
      id: 'source-edit-1',
      files: '$authoredSourceFiles',
      requestedEngines: '$selectedEngines',
      requestedAt: '$now',
    },
    responseSchema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            required: ['path', 'contents'],
            properties: {
              path: { type: 'string' },
              contents: { type: 'string' },
            },
          },
        },
      },
    },
    expectedReceiptLabels: ['Source files'],
    guardrails: [
      'Return edited source files only; do not return prose.',
      'Edit only the supplied source file paths.',
    ],
    blockers: [],
  };
}

describe('createAnthropicMotionSourceAuthorProvider', () => {
  it('authors supplied source files through a tool call and preserves provider provenance', async () => {
    const messagesCreate = vi.fn(async (input: unknown) => {
      void input;
      return {
        content: [
          {
            type: 'tool_use',
            name: 'author_motion_source_patch',
            input: {
              files: [
                {
                  path: 'timeline/draft-primary.json',
                  contents: '{"id":"draft-primary","tracks":[]}',
                },
                {
                  path: 'STORYBOARD.md',
                  contents: '# Storyboard\n\nSharper reveal beat.',
                },
              ],
            },
          },
        ],
      };
    });
    const provider = createAnthropicMotionSourceAuthorProvider({
      apiKey: 'sk-ant-test',
      model: 'claude-test-source-author',
      client: { messages: { create: messagesCreate } },
    });

    expect(provider.available()).toBe(true);

    const result = await provider.author(request());

    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const call = messagesCreate.mock.calls[0]?.[0] as {
      model: string;
      tools: Array<{ name: string }>;
      tool_choice: { type: string; name: string };
      messages: Array<{ content: Array<{ type: string; text: string }> }>;
      system: Array<{ cache_control?: { type: string } }>;
    };
    expect(call.model).toBe('claude-test-source-author');
    expect(call.tools[0]?.name).toBe('author_motion_source_patch');
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'author_motion_source_patch' });
    expect(call.messages[0]?.content[0]?.text).toContain('timeline/draft-primary.json');
    expect(call.messages[0]?.content[0]?.text).toContain('clip-beat-demo-text');
    expect(call.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(result).toEqual({
      providerId: 'anthropic-source-author',
      files: [
        {
          path: 'timeline/draft-primary.json',
          contents: '{"id":"draft-primary","tracks":[]}',
        },
        {
          path: 'STORYBOARD.md',
          contents: '# Storyboard\n\nSharper reveal beat.',
        },
      ],
      provenance: [{ kind: 'provider', ref: 'anthropic-source-author:claude-test-source-author' }],
    });
  });

  it('rejects authored files outside the source-author request', async () => {
    const provider = createAnthropicMotionSourceAuthorProvider({
      apiKey: 'sk-ant-test',
      model: 'claude-test-source-author',
      client: {
        messages: {
          create: vi.fn(async () => ({
            content: [
              {
                type: 'tool_use',
                name: 'author_motion_source_patch',
                input: {
                  files: [{ path: 'package.json', contents: '{}' }],
                },
              },
            ],
          })),
        },
      },
    });

    await expect(provider.author(request())).rejects.toThrow(
      /returned unsupported source file package\.json/
    );
  });

  it('is unavailable until both an API key and model are configured', () => {
    expect(
      createAnthropicMotionSourceAuthorProvider({
        apiKey: '',
        model: 'claude-test-source-author',
        client: { messages: { create: vi.fn() } },
      }).available()
    ).toBe(false);
    expect(
      createAnthropicMotionSourceAuthorProvider({
        apiKey: 'sk-ant-test',
        model: '',
        client: { messages: { create: vi.fn() } },
      }).available()
    ).toBe(false);
  });
});
