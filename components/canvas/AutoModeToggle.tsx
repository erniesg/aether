'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Surface } from '@/components/ui/Surface';
import type {
  AutoModeConcurrency,
  AutoModeNotifyMode,
} from '@/lib/agent/auto-mode';

/**
 * AutoModeToggle — workspace-level chip in canvas chrome.
 *
 * Strict UI taxonomy per CLAUDE.md hard rule #2:
 *   - Toggle = canvas chrome (`tool` zone). Floats next to FloatingToolbar.
 *   - Popover holds config (variation count / concurrency / notifyMode).
 *   - Persisted state lives in Convex (workspaceProviderPrefs-style row); v0
 *     keeps it in component state and lifts to a callback so the parent can
 *     persist however it wants.
 *
 * Progressive disclosure (hard rule #5): collapsed = single chip. Click
 * opens a small popover with the three knobs. No paragraph copy.
 */

export interface AutoModeConfig {
  enabled: boolean;
  variationCount: 1 | 2 | 3 | 4;
  concurrency: AutoModeConcurrency;
  notifyMode: AutoModeNotifyMode;
  /** When true, research / cluster / signoff use the Anthropic Managed
   *  Agents API (when AGENT_ID + ENVIRONMENT_ID are configured). When
   *  false, all three force the messages.create fallback path even with
   *  IDs set. Default true. */
  useManagedAgents: boolean;
}

export const DEFAULT_AUTO_MODE_CONFIG: AutoModeConfig = {
  enabled: false,
  variationCount: 2,
  concurrency: 'sequential',
  notifyMode: 'review',
  useManagedAgents: true,
};

export interface AutoModeToggleProps {
  config: AutoModeConfig;
  onChange: (next: AutoModeConfig) => void;
  /** True while a lap is currently running. The chip surfaces this so the
   *  toggle becomes a status indicator while work is in flight. */
  busy?: boolean;
  className?: string;
}

const VARIATION_OPTIONS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
const CONCURRENCY_OPTIONS: AutoModeConcurrency[] = ['sequential', 'parallel'];
const NOTIFY_OPTIONS: AutoModeNotifyMode[] = ['notify', 'review', 'auto-post'];

const NOTIFY_LABEL: Record<AutoModeNotifyMode, string> = {
  notify: 'Notify me',
  review: 'For review',
  'auto-post': 'Auto-post',
};

const CONCURRENCY_LABEL: Record<AutoModeConcurrency, string> = {
  sequential: 'Sequential',
  parallel: 'Parallel',
};

export function AutoModeToggle({
  config,
  onChange,
  busy,
  className,
}: AutoModeToggleProps) {
  const [open, setOpen] = useState(false);
  // Defer popover-related ids until after mount. React's useId is supposed
  // to be SSR-stable, but this component sits inside a Surface that gets
  // re-evaluated by the rail provider, producing different ids server vs
  // client and a hydration warning. Gating aria-controls on a mounted
  // flag eliminates the warning without changing render behaviour.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click — minimum-viable popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleToggleEnabled = useCallback(() => {
    onChange({ ...config, enabled: !config.enabled });
  }, [config, onChange]);

  const handlePickVariations = useCallback(
    (n: 1 | 2 | 3 | 4) => {
      onChange({ ...config, variationCount: n });
    },
    [config, onChange]
  );

  const handlePickConcurrency = useCallback(
    (c: AutoModeConcurrency) => {
      onChange({ ...config, concurrency: c });
    },
    [config, onChange]
  );

  const handlePickNotify = useCallback(
    (m: AutoModeNotifyMode) => {
      onChange({ ...config, notifyMode: m });
    },
    [config, onChange]
  );

  const handleToggleManagedAgents = useCallback(() => {
    onChange({ ...config, useManagedAgents: !config.useManagedAgents });
  }, [config, onChange]);

  const tone = busy ? 'info' : config.enabled ? 'accent' : 'neutral';
  const label = busy
    ? 'auto · running'
    : config.enabled
      ? 'auto · on'
      : 'auto';

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          handleToggleEnabled();
          setOpen(true);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        aria-pressed={config.enabled}
        aria-controls={mounted ? popoverId : undefined}
        aria-expanded={open}
        className="cursor-pointer focus:outline-none"
        title="Auto Mode — drop a URL or files; lap runs automatically. Right-click to configure."
      >
        <Chip tone={tone} size="sm" variant={config.enabled ? 'solid' : 'outline'}>
          {label}
        </Chip>
      </button>

      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Auto Mode configuration"
          // z-[1000] to clear tldraw canvas chrome and frame overlays —
          // tldraw uses up to ~999 for its own UI. Solid `overlay` tone +
          // shadow gives the popover proper contrast against canvas
          // content (was bleeding through with tone="panel").
          className="absolute z-[1000] mt-2 w-[260px]"
          style={{ top: '100%', right: 0 }}
        >
          <Surface tone="overlay" border="default" elevated className="p-3">
            <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted mb-2">
              Auto Mode
            </div>

            <Section label="Variations">
              <Row>
                {VARIATION_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handlePickVariations(n)}
                    aria-pressed={config.variationCount === n}
                    className="cursor-pointer focus:outline-none"
                  >
                    <Chip
                      tone={config.variationCount === n ? 'accent' : 'neutral'}
                      size="sm"
                      variant={config.variationCount === n ? 'solid' : 'outline'}
                    >
                      {n}
                    </Chip>
                  </button>
                ))}
              </Row>
            </Section>

            <Section label="Run">
              <Row>
                {CONCURRENCY_OPTIONS.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handlePickConcurrency(mode)}
                    aria-pressed={config.concurrency === mode}
                    className="cursor-pointer focus:outline-none"
                  >
                    <Chip
                      tone={config.concurrency === mode ? 'accent' : 'neutral'}
                      size="sm"
                      variant={config.concurrency === mode ? 'solid' : 'outline'}
                    >
                      {CONCURRENCY_LABEL[mode]}
                    </Chip>
                  </button>
                ))}
              </Row>
            </Section>

            <Section label="When done">
              <Row>
                {NOTIFY_OPTIONS.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handlePickNotify(mode)}
                    aria-pressed={config.notifyMode === mode}
                    className="cursor-pointer focus:outline-none"
                  >
                    <Chip
                      tone={config.notifyMode === mode ? 'accent' : 'neutral'}
                      size="sm"
                      variant={config.notifyMode === mode ? 'solid' : 'outline'}
                    >
                      {NOTIFY_LABEL[mode]}
                    </Chip>
                  </button>
                ))}
              </Row>
            </Section>

            <Section label="Agent path">
              <Row>
                <button
                  type="button"
                  onClick={handleToggleManagedAgents}
                  aria-pressed={config.useManagedAgents}
                  data-testid="auto-mode-managed-agents-toggle"
                  className="cursor-pointer focus:outline-none"
                  title="When on, research / cluster / signoff use the Anthropic Managed Agents API (when IDs configured). When off, all three force the messages.create fallback."
                >
                  <Chip
                    tone={config.useManagedAgents ? 'accent' : 'neutral'}
                    size="sm"
                    variant={config.useManagedAgents ? 'solid' : 'outline'}
                  >
                    {config.useManagedAgents ? 'Managed Agents' : 'Standard (messages.create)'}
                  </Chip>
                </button>
              </Row>
            </Section>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1.5 flex-wrap">{children}</div>;
}
