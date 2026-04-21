import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'ghost' | 'outline' | 'solid';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  label: string; // required for a11y
  active?: boolean;
  icon: ReactNode;
}

const sizeStyles: Record<IconButtonSize, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

const variantStyles: Record<IconButtonVariant, string> = {
  ghost: 'border-transparent bg-transparent text-ink-muted hover:bg-surface-panel-muted hover:text-ink',
  outline: 'border-border bg-surface-panel text-ink hover:border-accent hover:text-accent',
  solid: 'border-accent bg-accent text-ink-on-accent hover:bg-accent-strong',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'sm', variant = 'ghost', label, active, icon, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active ? true : undefined}
      data-active={active ? 'true' : undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-sm border',
        'transition-colors duration-fast ease-quick disabled:cursor-not-allowed disabled:opacity-50',
        'data-[active=true]:border-accent data-[active=true]:text-accent',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
