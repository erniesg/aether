import { describe, expect, it } from 'vitest';
import type { WorkspaceProviderPrefs } from '@/lib/providers/prefs';
import { motionAgentHandoffInputFromPrefs } from './agentHandoffClient';

describe('motionAgentHandoffInputFromPrefs', () => {
  it('maps workspace motion provider choices into handoff placeholders', () => {
    const prefs: WorkspaceProviderPrefs = {
      imageProviderId: 'runway',
      voiceProviderId: 'gemini-live',
      renderProviderId: 'hyperframes-local',
    };

    expect(motionAgentHandoffInputFromPrefs(prefs)).toEqual({
      imageToVideoProviderId: 'runway',
      voiceProviderId: 'gemini-live',
      renderProviderId: 'hyperframes-local',
    });
  });
});
