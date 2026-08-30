'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LogtoProvider, UserScope, useLogto, type LogtoConfig } from '@logto/react';
import type { PublicLogtoConfig } from '@/lib/auth/logto-config';
import {
  readStoredVibesKey,
  vibesAuthHeadersFrom,
  vibesDevHeaders,
  writeStoredVibesKey,
} from '@/lib/research/vibes/client-auth';

/**
 * Shared Vibes auth context — used by the /vibes workbench and the
 * /events/:eventId report page so "open report" works after a creator mints
 * a key, with no key ever placed in a URL. Auth resolves in order:
 *   1. a stored Vibes API key (localStorage)
 *   2. a Logto access token (when Logto is configured + signed in)
 *   3. the local-dev fallback header (no-op in production)
 */

export interface VibesAuthValue {
  /** Logto env present — sign-in is possible. */
  configured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  userLabel?: string;
  /** The cached Vibes API key (may be empty). */
  apiKey: string;
  hasKey: boolean;
  setApiKey: (key: string) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Mint a Vibes API key (signs in first when needed). */
  createApiKey: () => Promise<void>;
  keyBusy: boolean;
  keyError: string | null;
  /** Auth headers for a Vibes / event recap API fetch. Never throws. */
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const VibesAuthContext = createContext<VibesAuthValue | null>(null);

export function useVibesAuth(): VibesAuthValue {
  const value = useContext(VibesAuthContext);
  if (!value) {
    throw new Error('useVibesAuth must be used within a VibesAuthProvider');
  }
  return value;
}

/** Optional accessor — returns null outside a provider instead of throwing. */
export function useOptionalVibesAuth(): VibesAuthValue | null {
  return useContext(VibesAuthContext);
}

export function VibesAuthProvider({
  logtoConfig,
  children,
}: {
  logtoConfig: PublicLogtoConfig | null;
  children: ReactNode;
}) {
  if (!logtoConfig) {
    return <VibesAuthKeyOnly>{children}</VibesAuthKeyOnly>;
  }
  const config: LogtoConfig = {
    endpoint: logtoConfig.endpoint,
    appId: logtoConfig.appId,
    resources: [logtoConfig.apiResource],
    scopes: [UserScope.Email],
  };
  return (
    <LogtoProvider config={config}>
      <VibesAuthWithLogto logtoConfig={logtoConfig}>{children}</VibesAuthWithLogto>
    </LogtoProvider>
  );
}

function useStoredVibesKey() {
  const [apiKey, setApiKeyState] = useState('');
  useEffect(() => {
    setApiKeyState(readStoredVibesKey());
  }, []);
  const setApiKey = useCallback((key: string) => {
    const next = key.trim();
    setApiKeyState(next);
    writeStoredVibesKey(next);
  }, []);
  return { apiKey, setApiKey };
}

function VibesAuthKeyOnly({ children }: { children: ReactNode }) {
  const { apiKey, setApiKey } = useStoredVibesKey();
  const [keyError, setKeyError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(
    async () => vibesAuthHeadersFrom(apiKey),
    [apiKey]
  );

  const value = useMemo<VibesAuthValue>(
    () => ({
      configured: false,
      isAuthenticated: false,
      isLoading: false,
      apiKey,
      hasKey: Boolean(apiKey.trim()),
      setApiKey,
      signIn: async () => {
        setKeyError('Vibes sign-in is not configured in this environment.');
      },
      signOut: async () => {},
      createApiKey: async () => {
        setKeyError('Vibes sign-in is not configured — paste an existing API key.');
      },
      keyBusy: false,
      keyError,
      getAuthHeaders,
    }),
    [apiKey, getAuthHeaders, keyError, setApiKey]
  );

  return <VibesAuthContext.Provider value={value}>{children}</VibesAuthContext.Provider>;
}

function VibesAuthWithLogto({
  logtoConfig,
  children,
}: {
  logtoConfig: PublicLogtoConfig;
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading, signIn, signOut, getAccessToken, fetchUserInfo } =
    useLogto();
  const { apiKey, setApiKey } = useStoredVibesKey();
  const [userLabel, setUserLabel] = useState<string>();
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setUserLabel(undefined);
      return;
    }
    void fetchUserInfo?.().then((info) => {
      if (cancelled || !info) return;
      setUserLabel(info.email ?? info.name ?? info.sub);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchUserInfo, isAuthenticated]);

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      return (await getAccessToken?.(logtoConfig.apiResource)) ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken, logtoConfig.apiResource]);

  const doSignIn = useCallback(async () => {
    await signIn({
      redirectUri: `${window.location.origin}/api/logto/callback`,
      postRedirectUri: window.location.href,
    });
  }, [signIn]);

  const doSignOut = useCallback(async () => {
    await signOut(`${window.location.origin}${window.location.pathname}`);
  }, [signOut]);

  const createApiKey = useCallback(async () => {
    setKeyError(null);
    if (!isAuthenticated) {
      await doSignIn();
      return;
    }
    setKeyBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Logto access token unavailable.');
      const res = await fetch('/api/vibes/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Vibes key' }),
      });
      const json = (await res.json()) as { ok?: boolean; apiKey?: string; error?: string };
      if (!json.ok || !json.apiKey) throw new Error(json.error ?? `HTTP ${res.status}`);
      setApiKey(json.apiKey);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  }, [doSignIn, getToken, isAuthenticated, setApiKey]);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const key = apiKey.trim();
    if (key) return { Authorization: `Bearer ${key}` };
    const token = await getToken();
    if (token) return { Authorization: `Bearer ${token}` };
    return vibesDevHeaders();
  }, [apiKey, getToken]);

  const value = useMemo<VibesAuthValue>(
    () => ({
      configured: true,
      isAuthenticated,
      isLoading,
      userLabel,
      apiKey,
      hasKey: Boolean(apiKey.trim()),
      setApiKey,
      signIn: doSignIn,
      signOut: doSignOut,
      createApiKey,
      keyBusy,
      keyError,
      getAuthHeaders,
    }),
    [
      apiKey,
      createApiKey,
      doSignIn,
      doSignOut,
      getAuthHeaders,
      isAuthenticated,
      isLoading,
      keyBusy,
      keyError,
      setApiKey,
      userLabel,
    ]
  );

  return <VibesAuthContext.Provider value={value}>{children}</VibesAuthContext.Provider>;
}
