'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LogtoProvider, UserScope, useHandleSignInCallback, type LogtoConfig } from '@logto/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PublicLogtoConfig } from '@/lib/auth/logto-config';

export default function LogtoCallback({
  logtoConfig,
}: {
  logtoConfig: PublicLogtoConfig | null;
}) {
  if (!logtoConfig) return <CallbackError message="Logto frontend environment is not configured." />;

  const config: LogtoConfig = {
    endpoint: logtoConfig.endpoint,
    appId: logtoConfig.appId,
    resources: [logtoConfig.apiResource],
    scopes: [UserScope.Email],
  };

  return (
    <LogtoProvider config={config}>
      <CallbackBody />
    </LogtoProvider>
  );
}

function CallbackBody() {
  const callback = useHandleSignInCallback();

  useEffect(() => {
    if (callback.isAuthenticated) window.location.replace('/vibes');
  }, [callback.isAuthenticated]);

  if (callback.error) return <CallbackError message={callback.error.message} />;

  return (
    <main className="grid min-h-screen place-items-center bg-surface-base px-6 text-ink">
      <div className="text-center">
        <Loader2 size={24} className="mx-auto animate-spin text-accent" />
        <h1 className="mt-4 font-display text-2xl tracking-tight">Signing in</h1>
        <p className="mt-2 text-sm text-ink-muted">Returning to Vibes.</p>
      </div>
    </main>
  );
}

function CallbackError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-base px-6 text-ink">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl tracking-tight">Sign-in failed</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{message}</p>
        <Link href="/vibes" className="mt-5 inline-flex">
          <Button type="button" variant="primary" size="md">
            Back to Vibes
          </Button>
        </Link>
      </div>
    </main>
  );
}
