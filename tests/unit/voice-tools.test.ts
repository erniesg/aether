import { describe, expect, it, vi } from 'vitest';
import {
  dispatchVoiceFunctionCall,
  VOICE_TOOL_DEFINITIONS,
  VOICE_TOOL_NAMES,
  type VoiceDispatchers,
} from '@/lib/voice/tools';

function mockDispatchers(): VoiceDispatchers & {
  _mocks: {
    [K in keyof VoiceDispatchers]: ReturnType<typeof vi.fn>;
  };
} {
  const focus_format = vi.fn();
  const pan_zoom = vi.fn();
  const remove_background = vi.fn();
  const run_capability = vi.fn();
  const run_generate = vi.fn();
  return {
    focus_format,
    pan_zoom,
    remove_background,
    run_capability,
    run_generate,
    _mocks: {
      focus_format,
      pan_zoom,
      remove_background,
      run_capability,
      run_generate,
    },
  };
}

describe('voice tools', () => {
  it('exposes exactly the phase-1 safe verb set', () => {
    expect(VOICE_TOOL_NAMES).toEqual([
      'focus_format',
      'pan_zoom',
      'remove_background',
      'run_capability',
      'run_generate',
    ]);
    for (const tool of VOICE_TOOL_DEFINITIONS) {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.additionalProperties).toBe(false);
    }
  });

  it('dispatches focus_format with the string id signature the handler expects', async () => {
    const dispatchers = mockDispatchers();
    const outcome = await dispatchVoiceFunctionCall(
      'focus_format',
      { id: 'frame_ig_post' },
      dispatchers
    );
    expect(outcome).toEqual({ ok: true, detail: 'focused frame_ig_post' });
    expect(dispatchers._mocks.focus_format).toHaveBeenCalledWith({ id: 'frame_ig_post' });
  });

  it('dispatches remove_background as a nullary call', async () => {
    const dispatchers = mockDispatchers();
    const outcome = await dispatchVoiceFunctionCall(
      'remove_background',
      {},
      dispatchers
    );
    expect(outcome.ok).toBe(true);
    expect(dispatchers._mocks.remove_background).toHaveBeenCalledTimes(1);
    expect(dispatchers._mocks.remove_background).toHaveBeenCalledWith();
  });

  it('passes the prompt + scope through run_generate', async () => {
    const dispatchers = mockDispatchers();
    await dispatchVoiceFunctionCall(
      'run_generate',
      { prompt: 'add warm tones', scope: 'all' },
      dispatchers
    );
    expect(dispatchers._mocks.run_generate).toHaveBeenCalledWith({
      prompt: 'add warm tones',
      scope: 'all',
    });
  });

  it('dispatches pan_zoom with optional args preserved as undefined when absent', async () => {
    const dispatchers = mockDispatchers();
    await dispatchVoiceFunctionCall('pan_zoom', { zoom: 'fit' }, dispatchers);
    expect(dispatchers._mocks.pan_zoom).toHaveBeenCalledWith({
      artboardId: undefined,
      zoom: 'fit',
    });
  });

  it('fails closed when a required argument is missing or an unknown tool is called', async () => {
    const dispatchers = mockDispatchers();
    expect(
      await dispatchVoiceFunctionCall('focus_format', {}, dispatchers)
    ).toEqual({ ok: false, error: expect.stringContaining('focus_format') });
    expect(
      await dispatchVoiceFunctionCall('run_generate', {}, dispatchers)
    ).toEqual({ ok: false, error: expect.stringContaining('prompt') });
    expect(
      await dispatchVoiceFunctionCall('no_such_tool', { a: 1 }, dispatchers)
    ).toEqual({ ok: false, error: expect.stringContaining('no_such_tool') });
  });

  it('ignores unknown scope values and falls back to undefined', async () => {
    const dispatchers = mockDispatchers();
    await dispatchVoiceFunctionCall(
      'run_generate',
      { prompt: 'try', scope: 'weird' },
      dispatchers
    );
    expect(dispatchers._mocks.run_generate).toHaveBeenCalledWith({
      prompt: 'try',
      scope: undefined,
    });
  });
});
