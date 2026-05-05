import { describe, expect, it } from 'vitest';
import {
  buildVoiceGenerationPlan,
  enrichVoiceCommandWithProduct,
  normalizeLlmCommand,
  parseVoiceCommandHeuristically,
  voiceCommandRequestsSupportedLocales,
} from '@/lib/voice/command';

describe('voice command parsing', () => {
  it('parses generate-socials commands into an all-format creator generation', () => {
    const command = parseVoiceCommandHeuristically(
      'generate socials for Eight Sleep Pod 4 and hold for review'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod 4',
      referenceSearchQuery: 'Eight Sleep Pod 4',
      scope: 'all',
      publishMode: 'review',
      needsPublishClarification: false,
    });
    expect(command.prompt).toContain('Eight Sleep Pod 4');
  });

  it('distinguishes explicit auto-publish from ambiguous publish intent', () => {
    expect(
      parseVoiceCommandHeuristically(
        'generate socials for new matcha latte and auto publish'
      ).publishMode
    ).toBe('auto-post');
    expect(
      parseVoiceCommandHeuristically(
        'generate socials for new matcha latte and publish it automatically'
      ).publishMode
    ).toBe('auto-post');

    const ambiguous = parseVoiceCommandHeuristically(
      'generate socials for new matcha latte and publish it'
    );
    expect(ambiguous.publishMode).toBe('ask');
    expect(ambiguous.needsPublishClarification).toBe(true);
  });

  it('keeps platform and language scope words out of the creative brief', () => {
    const command = parseVoiceCommandHeuristically(
      'generate a campaign for Terra Coffee for all platforms and all supported languages and auto publish to x'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Terra Coffee',
      referenceSearchQuery: 'Terra Coffee',
      scope: 'all',
      publishMode: 'auto-post',
      targetPlatforms: ['x'],
      needsPublishClarification: false,
    });
    expect(command.prompt).toContain('Terra Coffee');
  });

  it('keeps X-only auto-publish scope when local Whisper hears extra words', () => {
    const command = parseVoiceCommandHeuristically(
      'January will campaign for the big sleeping part in different formats and languages and auto publish to X Tony.'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      publishMode: 'auto-post',
      targetPlatforms: ['x'],
      scope: 'all',
    });
    expect(voiceCommandRequestsSupportedLocales(command)).toBe(true);
  });

  it('normalizes common Eight Sleep Pod transcription slips', () => {
    const command = parseVoiceCommandHeuristically(
      'Generate a campaign for the 8 sleeping pop in various languages and platforms.'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      referenceSearchQuery: 'Eight Sleep Pod',
      scope: 'all',
    });
    expect(command.prompt).toContain('Eight Sleep Pod');
  });

  it('treats egg sleeping pop as a known Eight Sleep Pod voice slip before research', () => {
    const command = parseVoiceCommandHeuristically(
      'Generate a campaign for the egg sleeping pop in different dimensions and languages.'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      referenceSearchQuery: 'Eight Sleep Pod',
      product: {
        canonicalName: 'Eight Sleep Pod',
        source: 'catalog',
      },
    });
  });

  it('normalizes local Whisper Eight Sleep Pod slips from synthetic audio', () => {
    const command = parseVoiceCommandHeuristically(
      'Generate a campaign for AITS League pod in various languages and platforms.'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      referenceSearchQuery: 'Eight Sleep Pod',
      scope: 'all',
    });
    expect(command.product).toMatchObject({
      canonicalName: 'Eight Sleep Pod',
      source: 'catalog',
    });
  });

  it('maps aid sleeping part to Eight Sleep Pod before reference search', async () => {
    const command = await enrichVoiceCommandWithProduct({
      command: parseVoiceCommandHeuristically(
        'Generally a campaign for the aid sleeping part in different languages and formats.'
      ),
      allowResearch: false,
    });

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      referenceSearchQuery: 'Eight Sleep Pod',
      product: {
        id: 'eight-sleep-pod',
        canonicalName: 'Eight Sleep Pod',
        source: 'catalog',
      },
    });
    expect(command.prompt).toContain('Generate social creative for Eight Sleep Pod');
  });

  it('keeps campaign/platform voice intents as generate-socials when an LLM under-classifies them', () => {
    const command = normalizeLlmCommand(
      'Generate a campaign for the 8 sleeping pop in various languages and platforms.',
      {
        action: 'generate',
        brief: 'Generate a campaign for the product 8 Sleeping Pop',
        prompt: 'Create a campaign for 8 Sleeping Pop across multiple languages and platforms.',
        scope: 'all',
        referenceSearchQuery: '8 sleeping pop campaign',
        publishMode: 'ask',
        needsPublishClarification: true,
        confidence: 0.3,
      },
      'deepseek'
    );

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      referenceSearchQuery: 'Eight Sleep Pod',
      publishMode: 'review',
      needsPublishClarification: false,
      scope: 'all',
    });
    expect(command.prompt).toContain('Eight Sleep Pod');
  });

  it('normalizes LLM product slips so the canonical product drives reference search', async () => {
    const command = await enrichVoiceCommandWithProduct({
      command: normalizeLlmCommand(
        'Generally a campaign for the aid sleeping part in different languages and formats.',
        {
          action: 'generate-socials',
          brief: 'a campaign for the aid sleeping part',
          prompt: 'Create a campaign for the aid sleeping part.',
          scope: 'all',
          referenceSearchQuery: 'aid sleeping part campaign',
          publishMode: 'review',
          confidence: 0.52,
        },
        'deepseek'
      ),
      allowResearch: false,
    });

    expect(command.brief).toBe('Eight Sleep Pod');
    expect(command.referenceSearchQuery).toBe('Eight Sleep Pod');
    expect(command.prompt).toContain('Eight Sleep Pod');
  });

  it('enriches interpreted commands with a catalog-backed product match', async () => {
    const command = await enrichVoiceCommandWithProduct({
      command: normalizeLlmCommand(
        'Generate a campaign for the 8 sleeping pop in various languages and platforms.',
        {
          action: 'generate',
          brief: 'Generate a campaign for the product 8 Sleeping Pop',
          prompt: 'Create a campaign for 8 Sleeping Pop across multiple languages and platforms.',
          scope: 'all',
          referenceSearchQuery: '8 sleeping pop campaign',
          publishMode: 'review',
          confidence: 0.3,
        },
        'deepseek'
      ),
      allowResearch: false,
    });

    expect(command).toMatchObject({
      action: 'generate-socials',
      brief: 'Eight Sleep Pod',
      referenceSearchQuery: 'Eight Sleep Pod',
      product: {
        canonicalName: 'Eight Sleep Pod',
        source: 'catalog',
      },
    });
    expect(command.prompt).toContain('If none are relevant, generate from the brief');
  });

  it('can enrich unknown products through a provider-agnostic research adapter', async () => {
    const research = async () => ({
      brand: 'Terra',
      product: 'Coffee Sensor',
      description: 'A connected coffee freshness sensor.',
      imageUrls: ['https://cdn.example/terra.png'],
      source: 'knowledge-graph' as const,
    });
    const command = await enrichVoiceCommandWithProduct({
      command: parseVoiceCommandHeuristically(
        'generate a campaign for Terra Coffee Sensor across all platforms'
      ),
      allowResearch: true,
      research,
    });

    expect(command).toMatchObject({
      brief: 'Terra Coffee Sensor',
      referenceSearchQuery: 'Terra Coffee Sensor',
      product: {
        canonicalName: 'Terra Coffee Sensor',
        source: 'research',
      },
    });
    expect(command.prompt).toContain('A connected coffee freshness sensor.');
  });

  it('expands various-language voice requests to every supported locale', () => {
    const command = parseVoiceCommandHeuristically(
      'generate a campaign for Eight Sleep Pod in various languages and platforms'
    );
    const plan = buildVoiceGenerationPlan(command, {
      formats: [{ id: 'frame-1', label: 'IG Post', aspectRatio: '4:5' }],
      locales: ['en-SG'],
      languageMode: 'single',
      publishMode: 'review',
    });

    expect(voiceCommandRequestsSupportedLocales(command)).toBe(true);
    expect(plan.statusChips).toEqual(
      expect.arrayContaining([
        {
          label: 'languages',
          value: 'en-SG, zh-Hans-SG, ms-SG, ta-SG, ja-JP, ko-KR',
        },
      ])
    );
  });

  it('builds a generation plan from selected formats and selected locales', () => {
    const command = parseVoiceCommandHeuristically(
      'generate socials for sakura skincare'
    );
    const plan = buildVoiceGenerationPlan(command, {
      formats: [
        { id: 'frame-1', label: 'IG Post', aspectRatio: '4:5' },
        { id: 'frame-2', label: 'Story', aspectRatio: '9:16' },
      ],
      locales: ['ja-JP', 'ko-KR'],
      languageMode: 'multilingual',
      referenceUrls: ['https://img.example/ref.png'],
      publishMode: 'review',
    });

    expect(plan.options).toEqual({
      scope: 'all',
      renderMode: 'hero-seeded-fanout',
      heroCount: 2,
      notifyMode: 'review',
      refs: ['https://img.example/ref.png'],
    });
    expect(plan.statusChips).toEqual(
      expect.arrayContaining([
        { label: 'intent', value: 'generate socials' },
        { label: 'formats', value: '2' },
        { label: 'heroes', value: '2' },
        { label: 'languages', value: 'ja-JP, ko-KR' },
        { label: 'publish', value: 'review' },
      ])
    );
  });

  it('threads explicit publish platforms into the generation plan', () => {
    const command = parseVoiceCommandHeuristically(
      'generate socials for Eight Sleep Pod and auto publish to x only'
    );
    const plan = buildVoiceGenerationPlan(command, {
      formats: [{ id: 'frame-1', label: 'X banner', aspectRatio: '16:9' }],
      locales: ['en-SG'],
      languageMode: 'single',
    });

    expect(plan.options).toEqual(
      expect.objectContaining({
        notifyMode: 'auto-post',
        targetPlatforms: ['x'],
      })
    );
    expect(plan.statusChips).toEqual(
      expect.arrayContaining([{ label: 'platforms', value: 'x' }])
    );
  });
});
