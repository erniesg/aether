import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AsyncPushToTalk } from '@/components/canvas/AsyncPushToTalk';
import type { VoiceCreatorCommand } from '@/lib/voice/command';
import type { ReferenceRecord } from '@/lib/providers/reference/types';

afterEach(cleanup);

function command(overrides: Partial<VoiceCreatorCommand> = {}): VoiceCreatorCommand {
  return {
    action: 'generate-socials',
    transcript: 'generate socials for Eight Sleep',
    brief: 'Eight Sleep',
    prompt: 'Generate social creative for Eight Sleep.',
    scope: 'all',
    referenceSearchQuery: 'Eight Sleep',
    publishMode: 'review',
    needsPublishClarification: false,
    confidence: 0.82,
    source: 'heuristic',
    product: {
      id: 'eight-sleep-pod',
      canonicalName: 'Eight Sleep Pod',
      source: 'catalog',
      confidence: 0.96,
    },
    ...overrides,
  };
}

const record: ReferenceRecord = {
  id: 'ref_voice_1',
  kind: 'image',
  previewUrl: 'https://cdn.example/ref.png',
  attribution: {
    source: 'image-search',
    url: 'https://cdn.example/ref.png',
  },
  capturedAt: '2026-05-04T00:00:00.000Z',
};

describe('AsyncPushToTalk', () => {
  it('records, transcribes, interprets, searches refs, and dispatches generation without blocking the UI', async () => {
    const onGenerate = vi.fn();
    const onReference = vi.fn();
    const deps = {
      createRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(async () => new Blob(['audio'], { type: 'audio/webm' })),
      })),
      transcribe: vi.fn(async () => ({ text: 'generate socials for Eight Sleep' })),
      interpret: vi.fn(async () => command()),
      findReferences: vi.fn(async () => ({
        references: [{ url: 'https://cdn.example/ref.png', score: 0.9 }],
        records: [record],
        status: 'ok' as const,
      })),
    };

    render(
      <AsyncPushToTalk
        context={{
          formats: [{ id: 'frame-1', label: 'IG Post', aspectRatio: '4:5' }],
          locales: ['zh-Hans-SG', 'ms-SG'],
          languageMode: 'multilingual',
        }}
        onGenerate={onGenerate}
        onReference={onReference}
        deps={deps}
      />
    );

    const button = screen.getByRole('button', {
      name: /voice command · hold to speak/i,
    });
    fireEvent.pointerDown(button);
    await screen.findByText(/listening/i);
    fireEvent.pointerUp(button);

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledWith({
        prompt: 'Generate social creative for Eight Sleep.',
        options: {
          scope: 'all',
          renderMode: 'crop',
          notifyMode: 'review',
          refs: ['https://cdn.example/ref.png'],
        },
        command: expect.objectContaining({ brief: 'Eight Sleep' }),
        trace: expect.objectContaining({
          transcript: 'generate socials for Eight Sleep',
          selectedRefs: [
            expect.objectContaining({ url: 'https://cdn.example/ref.png' }),
          ],
        }),
      });
    });
    expect(onReference).not.toHaveBeenCalled();
    expect(screen.getByText('zh-Hans-SG, ms-SG')).toBeInTheDocument();
  });

  it('continues generation without refs when no relevant assets are found', async () => {
    const onGenerate = vi.fn();
    const deps = {
      createRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(async () => new Blob(['audio'], { type: 'audio/webm' })),
      })),
      transcribe: vi.fn(async () => ({ text: 'generate socials for launch' })),
      interpret: vi.fn(async () =>
        command({
          brief: 'launch',
          prompt: 'Generate social creative for launch.',
        })
      ),
      findReferences: vi.fn(async () => ({
        references: [],
        records: [],
        status: 'empty' as const,
      })),
    };

    render(
      <AsyncPushToTalk
        context={{
          formats: [{ id: 'frame-1', label: 'X banner', aspectRatio: '16:9' }],
          locales: ['en-SG'],
          languageMode: 'single',
        }}
        onGenerate={onGenerate}
        deps={deps}
      />
    );

    const button = screen.getByRole('button', {
      name: /voice command · hold to speak/i,
    });
    fireEvent.pointerDown(button);
    await screen.findByText(/listening/i);
    fireEvent.pointerUp(button);

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledWith({
        prompt: 'Generate social creative for launch.',
        options: {
          scope: 'all',
          renderMode: 'crop',
          notifyMode: 'review',
        },
        command: expect.objectContaining({ brief: 'launch' }),
        trace: expect.objectContaining({
          selectedRefs: [],
        }),
      });
    });
  });

  it('shows every supported locale when the voice command asks for various languages', async () => {
    const onGenerate = vi.fn();
    const deps = {
      createRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(async () => new Blob(['audio'], { type: 'audio/webm' })),
      })),
      transcribe: vi.fn(async () => ({
        text: 'generate a campaign for Eight Sleep Pod in various languages',
      })),
      interpret: vi.fn(async () =>
        command({
          transcript: 'generate a campaign for Eight Sleep Pod in various languages',
          brief: 'Eight Sleep Pod',
          prompt: 'Generate social creative for Eight Sleep Pod in various languages.',
          referenceSearchQuery: undefined,
        })
      ),
      findReferences: vi.fn(),
    };

    render(
      <AsyncPushToTalk
        context={{
          formats: [{ id: 'frame-1', label: 'X banner', aspectRatio: '16:9' }],
          locales: ['en-SG'],
          languageMode: 'single',
        }}
        onGenerate={onGenerate}
        deps={deps}
      />
    );

    const button = screen.getByRole('button', {
      name: /voice command · hold to speak/i,
    });
    fireEvent.pointerDown(button);
    await screen.findByText(/listening/i);
    fireEvent.pointerUp(button);

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalled();
    });
    expect(
      screen.getByText('en-SG, zh-Hans-SG, ms-SG, ta-SG, ja-JP, ko-KR')
    ).toBeInTheDocument();
  });

  it('pauses for creator review when product/ref confidence is uncertain and promotes only kept refs', async () => {
    const onGenerate = vi.fn();
    const onReference = vi.fn();
    const lowScoreRecord: ReferenceRecord = {
      ...record,
      productId: 'eight-sleep-pod',
      productCanonicalName: 'Eight Sleep Pod',
      relevanceScore: 0.46,
      referenceStatus: 'candidate',
    };
    const deps = {
      createRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(async () => new Blob(['audio'], { type: 'audio/webm' })),
      })),
      transcribe: vi.fn(async () => ({
        text: 'generally a campaign for the aid sleeping part',
      })),
      interpret: vi.fn(async () =>
        command({
          transcript: 'generally a campaign for the aid sleeping part',
          brief: 'Eight Sleep Pod',
          referenceSearchQuery: 'Eight Sleep Pod',
          confidence: 0.55,
          product: {
            id: 'eight-sleep-pod',
            canonicalName: 'Eight Sleep Pod',
            source: 'catalog',
            confidence: 0.96,
          },
        })
      ),
      findReferences: vi.fn(async () => ({
        references: [{ url: 'https://cdn.example/ref.png', score: 0.46 }],
        records: [lowScoreRecord],
        status: 'ok' as const,
      })),
    };

    render(
      <AsyncPushToTalk
        context={{
          formats: [{ id: 'frame-1', label: 'IG Post', aspectRatio: '4:5' }],
          locales: ['en-SG'],
          languageMode: 'single',
        }}
        onGenerate={onGenerate}
        onReference={onReference}
        deps={deps}
      />
    );

    const button = screen.getByRole('button', {
      name: /voice command · hold to speak/i,
    });
    fireEvent.pointerDown(button);
    await screen.findByText(/listening/i);
    fireEvent.pointerUp(button);

    await screen.findByTestId('async-voice-review-ready');
    expect(screen.getByText('Eight Sleep Pod · 96%')).toBeInTheDocument();
    expect(screen.getByText('46%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep reference 46%/i }));
    fireEvent.click(screen.getByRole('button', { name: /use selected/i }));

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            refs: ['https://cdn.example/ref.png'],
          }),
          trace: expect.objectContaining({
            referenceCandidates: [
              expect.objectContaining({
                url: 'https://cdn.example/ref.png',
                score: 0.46,
              }),
            ],
            selectedRefs: [
              expect.objectContaining({ url: 'https://cdn.example/ref.png' }),
            ],
          }),
        })
      );
    });
    expect(onReference).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceStatus: 'selected',
        productId: 'eight-sleep-pod',
      })
    );
  });
});
