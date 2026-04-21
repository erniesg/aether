import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-ink-on-accent border-accent hover:bg-accent-strong hover:border-accent-strong',
  ghost:
    'bg-transparent text-ink-muted border-transparent hover:bg-surface-panel-muted hover:text-ink',
  outline:
    'bg-surface-panel text-ink border-border hover:border-accent hover:text-accent',
  subtle:
    'bg-surface-panel-muted text-ink border-border-soft hover:bg-surface-panel hover:border-border',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2.5 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon, trailing, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm border font-medium',
        'transition-colors duration-fast ease-quick disabled:cursor-not-allowed disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
});
