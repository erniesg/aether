import type { VoiceSessionCredentials } from './types';

export interface FetchVoiceSessionOptions {
  workspaceId?: string;
}

export async function fetchVoiceSession(
  endpoint: string,
  options: FetchVoiceSessionOptions = {}
): Promise<VoiceSessionCredentials> {
  const workspaceId = options.workspaceId?.trim();
  const res = await fetch(endpoint, {
    method: 'POST',
    ...(workspaceId
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId }),
        }
      : {}),
  });
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
