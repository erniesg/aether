'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LogtoProvider, UserScope, useLogto, type LogtoConfig } from '@logto/react';
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  Radio,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { PublicLogtoConfig } from '@/lib/auth/logto-config';
import VibesWorkbench, { type VibesAuthHeaderGetter } from './VibesWorkbench';

interface VibesLandingProps {
  logtoConfig: PublicLogtoConfig | null;
}

interface AuthControls {
  configured: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  userLabel?: string;
  signIn?: () => Promise<void>;
  signOut?: () => Promise<void>;
  getAccessToken?: () => Promise<string | null>;
}

interface KeyInfo {
  keyId: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  dailyLimit: number;
  createdAt: number;
  lastUsedAt?: number;
}

const KEY_STORAGE = 'aether.vibes.apiKey';

export default function VibesLanding({ logtoConfig }: VibesLandingProps) {
  if (!logtoConfig) {
    return <VibesLandingShell logtoConfig={null} auth={{ configured: false, isAuthenticated: false, isLoading: false }} />;
  }

  const config: LogtoConfig = {
    endpoint: logtoConfig.endpoint,
    appId: logtoConfig.appId,
    resources: [logtoConfig.apiResource],
    scopes: [UserScope.Email],
  };

  return (
    <LogtoProvider config={config}>
      <VibesLandingWithLogto logtoConfig={logtoConfig} />
    </LogtoProvider>
  );
}

function VibesLandingWithLogto({ logtoConfig }: { logtoConfig: PublicLogtoConfig }) {
  const logto = useLogto();
  const {
    isAuthenticated,
    isLoading,
    signIn,
    signOut,
    getAccessToken,
    fetchUserInfo,
  } = logto;
  const [userLabel, setUserLabel] = useState<string>();

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

  const auth = useMemo<AuthControls>(
    () => ({
      configured: true,
      isAuthenticated,
      isLoading,
      userLabel,
      signIn: async () => {
        await signIn({
          redirectUri: `${window.location.origin}/api/logto/callback`,
          postRedirectUri: `${window.location.origin}/vibes`,
        });
      },
      signOut: async () => {
        await signOut(`${window.location.origin}/vibes`);
      },
      getAccessToken: async () => {
        const token = await getAccessToken?.(logtoConfig.apiResource);
        return token ?? null;
      },
    }),
    [getAccessToken, isAuthenticated, isLoading, logtoConfig.apiResource, signIn, signOut, userLabel]
  );

  return <VibesLandingShell logtoConfig={logtoConfig} auth={auth} />;
}

function VibesLandingShell({
  logtoConfig,
  auth,
}: {
  logtoConfig: PublicLogtoConfig | null;
  auth: AuthControls;
}) {
  const [apiKey, setApiKey] = useState('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setApiKey(localStorage.getItem(KEY_STORAGE) ?? '');
    } catch {
      setApiKey('');
    }
  }, []);

  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem(KEY_STORAGE, apiKey);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      // Local storage is a convenience cache only.
    }
  }, [apiKey]);

  const getAuthHeader = useCallback<VibesAuthHeaderGetter>(async () => {
    const key = apiKey.trim();
    if (key) return `Bearer ${key}`;
    const token = await auth.getAccessToken?.();
    return token ? `Bearer ${token}` : null;
  }, [apiKey, auth]);

  async function signInOrCreateKey() {
    setKeyError(null);
    if (!auth.configured || !auth.isAuthenticated) {
      await auth.signIn?.();
      return;
    }
    setKeyBusy(true);
    try {
      const token = await auth.getAccessToken?.();
      if (!token) throw new Error('Logto access token unavailable.');
      const res = await fetch('/api/vibes/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: 'Default Vibes key' }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        apiKey?: string;
        key?: KeyInfo;
        error?: string;
      };
      if (!json.ok || !json.apiKey || !json.key) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setApiKey(json.apiKey);
      setKeys((items) => [json.key!, ...items.filter((item) => item.keyId !== json.key!.keyId)]);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  }

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="min-h-screen bg-surface-base text-ink">
      <header className="sticky top-0 z-20 flex h-header items-center justify-between border-b border-border-soft bg-surface-panel/95 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="font-display text-lg tracking-tight">
            aether
          </Link>
          <Chip tone="info" size="sm">
            vibes
          </Chip>
        </div>
        <div className="flex items-center gap-2">
          {auth.isAuthenticated ? (
            <Chip tone="ok" size="sm" className="hidden max-w-[220px] truncate sm:inline-flex">
              {auth.userLabel ?? 'signed in'}
            </Chip>
          ) : null}
          {auth.configured ? (
            auth.isAuthenticated ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void auth.signOut?.()}>
                sign out
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void auth.signIn?.()}
                icon={auth.isLoading ? <Loader2 size={13} className="animate-spin" /> : <LockKeyhole size={13} />}
              >
                sign in
              </Button>
            )
          ) : (
            <Chip tone="warn" size="sm">
              auth env
            </Chip>
          )}
          <ThemeToggle />
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border-soft">
        <div className="absolute inset-0 opacity-70">
          <SignalWall />
        </div>
        <div className="relative mx-auto grid min-h-[82vh] max-w-7xl content-end gap-10 px-4 pb-10 pt-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-3xl pb-4">
            <div className="flex flex-wrap gap-2">
              <Chip tone="accent" size="sm">
                managed research agents
              </Chip>
              <Chip tone="neutral" size="sm">
                logto + app api keys
              </Chip>
            </div>
            <h1 className="mt-5 font-display text-5xl leading-none tracking-tight sm:text-7xl">
              Vibes
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">
              Social listening for events, products, brands, and launches. Start from a natural-language brief,
              review the generated frontier, then collect posts, metadata, media, clusters, voices, and a report.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => void signInOrCreateKey()}
                icon={keyBusy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                trailing={<ArrowRight size={16} />}
              >
                {auth.isAuthenticated ? 'create api key' : 'sign in for api key'}
              </Button>
              <a
                href="#research-shell"
                className="inline-flex h-11 items-center justify-center rounded-sm border border-border bg-surface-panel px-5 text-base font-medium text-ink hover:border-accent hover:text-accent"
              >
                open shell
              </a>
            </div>
          </div>

          <Surface taxonomy="metadata" border="soft" className="bg-surface-panel/95 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-caption text-xs uppercase text-ink-dim">api access</p>
                <p className="mt-1 font-display text-xl tracking-tight">100 calls / user / day</p>
              </div>
              <KeyRound size={18} className="text-accent" />
            </div>
            <div className="mt-4 rounded-sm border border-border-soft bg-surface-base p-3">
              <p className="font-caption text-xs uppercase text-ink-dim">current key</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="vibes_vk_..."
                  className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => void copyKey()}
                  className="grid h-9 w-9 place-items-center rounded-sm border border-border-soft text-ink-dim hover:border-accent hover:text-accent"
                  title="copy key"
                  aria-label="copy key"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              {keyError ? <p className="mt-2 font-caption text-xs text-signal-error">{keyError}</p> : null}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <AccessMetric icon={<Search size={14} />} label="frontier" />
              <AccessMetric icon={<Radio size={14} />} label="listening" />
              <AccessMetric icon={<Sparkles size={14} />} label="report" />
            </div>
            {keys[0] ? (
              <p className="mt-3 truncate font-mono text-xs text-ink-dim">
                issued {keys[0].keyPrefix}
              </p>
            ) : null}
          </Surface>
        </div>
      </section>

      <section id="research-shell" className="scroll-mt-header">
        <VibesWorkbench getAuthHeader={getAuthHeader} />
      </section>
    </main>
  );
}

function AccessMetric({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-border-soft bg-surface-base px-2 py-2 font-mono text-xs text-ink-muted">
      <span className="text-accent">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function SignalWall() {
  const cells = [
    ['#launch', '@founder', 'video'],
    ['speaker', 'booth', 'image'],
    ['competitor', '#recap', 'thread'],
    ['review', 'demo', '@press'],
    ['clip', 'sponsor', 'quote'],
    ['trend', 'shorts', '#live'],
  ];

  return (
    <div className="grid h-full grid-cols-2 gap-px bg-border-soft sm:grid-cols-3">
      {cells.map((row, rowIndex) =>
        row.map((label, index) => (
          <div
            key={`${rowIndex}-${label}`}
            className="flex min-h-[10rem] items-end border-border-soft bg-surface-panel-muted/70 p-3"
          >
            <span className="rounded-sm border border-border-soft bg-surface-base/80 px-2 py-1 font-mono text-xs text-ink-dim">
              {label}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
