/**
 * provider-prefs — resolver precedence tests.
 *
 * Rule: workspace pref > env var > code default.
 * These tests exercise resolveVoiceProvider, resolveImageProvider, and
 * resolveSegmentationProviderId from lib/providers/prefs.ts in isolation.
 * No Convex network calls — the Convex query is stubbed via the optional
 * `prefsOverride` parameter on each resolver.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';
import {
  resolveImageProviderId,
  resolveSegmentationProviderId,
  resolveVoiceProvider,
} from '@/lib/providers/prefs';

const ORIGINAL_ENV = { ...process.env };

describe('resolveVoiceProvider', () => {
  beforeEach(() => {
    // ensure clean env for every test
    delete process.env.VOICE_PROVIDER;
    delete process.env.GEMINI_LIVE_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns workspace pref when set — overrides env', () => {
    process.env.VOICE_PROVIDER = 'openai-realtime';
    const prefs: WorkspaceProviderPrefs = { voiceProviderId: 'gemini-live' };
    const result = resolveVoiceProvider(prefs);
    expect(result.providerId).toBe('gemini-live');
  });

  it('returns workspace pref model when set', () => {
    const prefs: WorkspaceProviderPrefs = {
      voiceProviderId: 'gemini-live',
      voiceModel: 'gemini-3.1-flash-live-preview',
    };
    const result = resolveVoiceProvider(prefs);
    expect(result.providerId).toBe('gemini-live');
    expect(result.model).toBe('gemini-3.1-flash-live-preview');
  });

  it('falls back to env when no workspace pref exists', () => {
    process.env.VOICE_PROVIDER = 'openai-realtime';
    const result = resolveVoiceProvider(null);
    expect(result.providerId).toBe('openai-realtime');
  });

  it('falls back to env when prefs object has no voiceProviderId', () => {
    process.env.VOICE_PROVIDER = 'openai-realtime';
    const prefs: WorkspaceProviderPrefs = { imageProviderId: 'gemini' };
    const result = resolveVoiceProvider(prefs);
    expect(result.providerId).toBe('openai-realtime');
  });

  it('falls back to gemini-live code default when env is unset and prefs are null', () => {
    const result = resolveVoiceProvider(null);
    expect(result.providerId).toBe('gemini-live');
  });

  it('env wins over code default', () => {
    process.env.VOICE_PROVIDER = 'openai-realtime';
    const result = resolveVoiceProvider(null);
    expect(result.providerId).toBe('openai-realtime');
  });

  it('uses GEMINI_LIVE_MODEL env when pref model is absent and provider is gemini-live', () => {
    process.env.GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-native-audio';
    const prefs: WorkspaceProviderPrefs = { voiceProviderId: 'gemini-live' };
    const result = resolveVoiceProvider(prefs);
    expect(result.model).toBe('gemini-live-2.5-flash-native-audio');
  });
});

describe('resolveImageProviderId', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns workspace pref when set — overrides env', () => {
    process.env.IMAGE_GEN_PROVIDER = 'openai';
    const prefs: WorkspaceProviderPrefs = { imageProviderId: 'gemini' };
    expect(resolveImageProviderId(prefs)).toBe('gemini');
  });

  it('falls back to env when no workspace pref exists', () => {
    process.env.IMAGE_GEN_PROVIDER = 'openai';
    expect(resolveImageProviderId(null)).toBe('openai');
  });

  it('falls back to env when prefs object has no imageProviderId', () => {
    process.env.IMAGE_GEN_PROVIDER = 'replicate';
    const prefs: WorkspaceProviderPrefs = { voiceProviderId: 'gemini-live' };
    expect(resolveImageProviderId(prefs)).toBe('replicate');
  });

  it('returns undefined when neither pref nor env is set (registry picks first available)', () => {
    delete process.env.IMAGE_GEN_PROVIDER;
    expect(resolveImageProviderId(null)).toBeUndefined();
  });

  it('workspace pref wins over env — replicate case', () => {
    process.env.IMAGE_GEN_PROVIDER = 'openai';
    const prefs: WorkspaceProviderPrefs = { imageProviderId: 'replicate' };
    expect(resolveImageProviderId(prefs)).toBe('replicate');
  });
});

describe('resolveSegmentationProviderId', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns workspace pref when set — overrides env', () => {
    process.env.SEGMENTATION_PROVIDER = 'sam3';
    const prefs: WorkspaceProviderPrefs = { segmentationProviderId: 'sam2' };
    expect(resolveSegmentationProviderId(prefs)).toBe('sam2');
  });

  it('falls back to env when no workspace pref exists', () => {
    process.env.SEGMENTATION_PROVIDER = 'sam2';
    expect(resolveSegmentationProviderId(null)).toBe('sam2');
  });

  it('falls back to env when prefs object has no segmentationProviderId', () => {
    process.env.SEGMENTATION_PROVIDER = 'sam3';
    const prefs: WorkspaceProviderPrefs = { imageProviderId: 'gemini' };
    expect(resolveSegmentationProviderId(prefs)).toBe('sam3');
  });

  it('returns undefined when neither pref nor env is set (registry picks first available)', () => {
    delete process.env.SEGMENTATION_PROVIDER;
    expect(resolveSegmentationProviderId(null)).toBeUndefined();
  });

  it('workspace pref wins over env — sam3 case', () => {
    process.env.SEGMENTATION_PROVIDER = 'sam2';
    const prefs: WorkspaceProviderPrefs = { segmentationProviderId: 'sam3' };
    expect(resolveSegmentationProviderId(prefs)).toBe('sam3');
  });
});
