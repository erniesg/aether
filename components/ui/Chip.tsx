import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type ChipTone = 'neutral' | 'accent' | 'secondary' | 'ok' | 'warn' | 'error' | 'info';
export type ChipSize = 'sm' | 'md';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  size?: ChipSize;
  icon?: ReactNode;
  trailing?: ReactNode;
  variant?: 'solid' | 'outline' | 'ghost';
}

const toneStyles: Record<ChipTone, string> = {
  neutral: 'text-ink-muted border-border-soft bg-surface-panel-muted',
  accent: 'text-ink-on-accent border-accent bg-accent',
  secondary: 'text-ink-muted border-accent-secondary/30 bg-accent-secondary/10',
  ok: 'text-signal-ok border-signal-ok/30 bg-signal-ok/10',
  warn: 'text-signal-warn border-signal-warn/40 bg-signal-warn/10',
  error: 'text-signal-error border-signal-error/30 bg-signal-error/10',
  info: 'text-signal-info border-signal-info/30 bg-signal-info/10',
};

const variantStyles: Record<NonNullable<ChipProps['variant']>, string> = {
  solid: '',
  outline: 'bg-transparent',
  ghost: 'border-transparent bg-transparent',
};

const sizeStyles: Record<ChipSize, string> = {
  sm: 'gap-1 px-1.5 py-0.5 text-2xs',
  md: 'gap-1.5 px-2 py-0.5 text-xs',
};

/**
 * Chip — small inline status/metadata primitive.
 * By default carries the `metadata` taxonomy contract (see CLAUDE.md). Use
 * `tone` to signal category; use `variant` for visual weight.
 */
export function Chip({
  tone = 'neutral',
  size = 'md',
  variant = 'outline',
  icon,
  trailing,
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-pill border font-mono uppercase tracking-wide',
        'transition-colors duration-fast ease-quick',
        sizeStyles[size],
        toneStyles[tone],
        variantStyles[variant],
        className
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      {children}
      {trailing ? <span className="shrink-0 opacity-80">{trailing}</span> : null}
    </span>
  );
}
