import type { VoiceSessionCredentials } from './types';

export async function fetchVoiceSession(
  endpoint: string
): Promise<VoiceSessionCredentials> {
  const res = await fetch(endpoint, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`voice: session endpoint returned ${res.status}`);
  }
  const json = (await res.json()) as {
    ok?: boolean;
    session?: VoiceSessionCredentials;
    error?: string;
  };
  if (!json.ok || !json.session) {
    throw new Error(json.error ?? 'voice: session endpoint returned no session');
  }
  return json.session;
}
