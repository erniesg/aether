'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, LockKeyhole, Radio } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { useVibesAuth } from '@/components/vibes/vibes-auth';

/**
 * Secondary access control for Vibes surfaces — a header popover, not a hero
 * card. Sign in, mint / paste / copy the Vibes API key. Shared by the /vibes
 * workbench and the /events/:eventId report page so a creator can fix auth
 * wherever they land.
 */
export function VibesAccessMenu() {
  const auth = useVibesAuth();
  const [copied, setCopied] = useState(false);

  const status: { tone: ChipTone; label: string } = auth.hasKey
    ? { tone: 'ok', label: 'key set' }
    : auth.isAuthenticated
      ? { tone: 'info', label: 'signed in' }
      : { tone: 'neutral', label: 'access' };

  async function copyKey() {
    if (!auth.apiKey) return;
    await navigator.clipboard.writeText(auth.apiKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <details className="relative">
      <summary
        data-testid="vibes-access"
        className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm border border-border-soft px-2 font-mono text-xs text-ink-dim hover:border-accent hover:text-accent [&::-webkit-details-marker]:hidden"
      >
        <KeyRound size={13} strokeWidth={1.75} />
        <Chip tone={status.tone} size="sm" variant="ghost">
          {status.label}
        </Chip>
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border-soft bg-surface-panel p-3 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <p className="font-caption text-xs uppercase text-ink-dim">vibes access</p>
          <span className="font-mono text-2xs text-ink-dim">100 calls / day</span>
        </div>

        {auth.configured ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-xs text-ink-muted">
              {auth.isAuthenticated ? auth.userLabel ?? 'signed in' : 'not signed in'}
            </span>
            {auth.isAuthenticated ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void auth.signOut()}>
                sign out
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={
                  auth.isLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <LockKeyhole size={13} />
                  )
                }
                onClick={() => void auth.signIn()}
              >
                sign in
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-3 font-caption text-xs text-ink-dim">
            Sign-in is not configured here — paste an existing Vibes API key.
          </p>
        )}

        <div className="mt-3 rounded-sm border border-border-soft bg-surface-base p-2">
          <p className="font-caption text-2xs uppercase text-ink-dim">api key</p>
          <div className="mt-2 flex gap-1.5">
            <input
              value={auth.apiKey}
              onChange={(e) => auth.setApiKey(e.target.value)}
              placeholder="vibes_vk_..."
              className="min-w-0 flex-1 rounded-sm border border-border-soft bg-surface-panel px-2 py-1.5 font-mono text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void copyKey()}
              disabled={!auth.apiKey}
              className="grid h-8 w-8 place-items-center rounded-sm border border-border-soft text-ink-dim hover:border-accent hover:text-accent disabled:opacity-40"
              title="copy key"
              aria-label="copy key"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => void auth.createApiKey()}
              icon={auth.keyBusy ? <Loader2 size={13} className="animate-spin" /> : <Radio size={13} />}
            >
              {auth.isAuthenticated ? 'create key' : 'sign in for key'}
            </Button>
            <span className="font-caption text-2xs text-ink-dim">stored on this device</span>
          </div>
          {auth.keyError ? (
            <p className="mt-2 font-caption text-2xs text-signal-error">{auth.keyError}</p>
          ) : null}
        </div>
      </div>
    </details>
  );
}
