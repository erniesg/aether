import type { HTMLAttributes, ReactNode } from 'react';
import { Chip } from '@/components/ui/Chip';
import { cn } from '@/lib/utils/cn';
import type { DeckSlideKind } from '@/lib/deck/types';

interface BaseSlideShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  kind: DeckSlideKind;
  kicker?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  spacious?: boolean;
}

export function BaseSlideShell({
  kind,
  kicker,
  title,
  subtitle,
  footer,
  children,
  spacious = false,
  className,
  ...rest
}: BaseSlideShellProps) {
  return (
    <div
      data-taxonomy="output"
      data-slide-shell={kind}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-surface-canvas text-ink',
        spacious ? 'p-[128px]' : 'p-[96px]',
        className
      )}
      {...rest}
    >
      {kicker ? (
        <div className="mb-[28px] flex items-center gap-[16px] text-[28px] leading-none text-ink-muted">
          {typeof kicker === 'string' ? (
            <Chip tone="secondary" variant="outline" className="text-[18px]">
              {kicker}
            </Chip>
          ) : (
            kicker
          )}
        </div>
      ) : null}
      {title ? (
        <h2 className="max-w-[1320px] text-[86px] font-semibold leading-[0.98] tracking-default text-ink">
          {title}
        </h2>
      ) : null}
      {subtitle ? (
        <p className="mt-[28px] max-w-[1120px] text-[34px] leading-[1.25] text-ink-muted">
          {subtitle}
        </p>
      ) : null}
      {children}
      {footer ? (
        <div className="mt-auto pt-[48px] text-[24px] leading-[1.35] text-ink-dim">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function TitleSlideShell({
  children,
  ...props
}: Omit<BaseSlideShellProps, 'kind'>) {
  return (
    <BaseSlideShell
      kind="title"
      spacious
      className="justify-center bg-surface-canvas"
      {...props}
    >
      {children}
    </BaseSlideShell>
  );
}

export function SectionSlideShell({
  marker,
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'> & { marker?: ReactNode }) {
  return (
    <BaseSlideShell
      kind="section"
      spacious
      className={cn('justify-center', className)}
      {...props}
    >
      {marker ? (
        <div className="mb-[40px] text-[42px] font-medium text-accent">{marker}</div>
      ) : null}
      {children}
    </BaseSlideShell>
  );
}

export function SplitProofSlideShell({
  proof,
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'> & { proof: ReactNode }) {
  return (
    <BaseSlideShell kind="split-proof" className={cn('gap-[56px]', className)} {...props}>
      <div className="grid flex-1 grid-cols-[1fr_0.9fr] gap-[64px] pt-[56px]">
        <div className="min-w-0">{children}</div>
        <div className="min-w-0 rounded-[8px] border border-border-soft bg-surface-panel-muted p-[48px]">
          {proof}
        </div>
      </div>
    </BaseSlideShell>
  );
}

export function DiagramSlideShell({
  diagram,
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'> & { diagram: ReactNode }) {
  return (
    <BaseSlideShell kind="diagram" className={cn('gap-[48px]', className)} {...props}>
      <div className="grid flex-1 grid-cols-[1.15fr_0.85fr] gap-[56px] pt-[48px]">
        <div className="min-h-0 rounded-[8px] border border-border bg-surface-panel p-[40px]">
          {diagram}
        </div>
        <div className="min-w-0 text-[30px] leading-[1.35] text-ink-muted">{children}</div>
      </div>
    </BaseSlideShell>
  );
}

export function LiveDemoSlideShell({
  demo,
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'> & { demo: ReactNode }) {
  return (
    <BaseSlideShell kind="live-demo" className={cn('gap-[44px]', className)} {...props}>
      <div className="grid flex-1 grid-rows-[1fr_auto] gap-[28px] pt-[40px]">
        <div className="min-h-0 overflow-hidden rounded-[8px] border border-border bg-surface-panel">
          {demo}
        </div>
        {children ? (
          <div className="text-[24px] leading-[1.35] text-ink-muted">{children}</div>
        ) : null}
      </div>
    </BaseSlideShell>
  );
}

export function CodeReferenceSlideShell({
  code,
  fileLabel,
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'> & { code?: string; fileLabel?: ReactNode }) {
  return (
    <BaseSlideShell kind="code-reference" className={cn('gap-[40px]', className)} {...props}>
      <div className="mt-[40px] grid flex-1 grid-cols-[1fr_0.55fr] gap-[48px]">
        <figure className="min-h-0 overflow-hidden rounded-[8px] border border-border bg-surface-panel text-[24px] leading-[1.45] text-ink">
          {fileLabel ? (
            <figcaption className="border-b border-border-soft px-[32px] py-[20px] font-mono text-[20px] text-ink-muted">
              {fileLabel}
            </figcaption>
          ) : null}
          <pre className="h-full overflow-hidden p-[32px] font-mono">
            <code>{code}</code>
          </pre>
        </figure>
        <div className="min-w-0 text-[28px] leading-[1.35] text-ink-muted">{children}</div>
      </div>
    </BaseSlideShell>
  );
}

export interface MetricStripItem {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}

export function MetricStripSlideShell({
  metrics,
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'> & { metrics: MetricStripItem[] }) {
  return (
    <BaseSlideShell kind="metric-strip" className={cn('gap-[56px]', className)} {...props}>
      <div className="mt-[64px] grid grid-cols-3 gap-[28px]">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className="min-h-[220px] rounded-[8px] border border-border-soft bg-surface-panel p-[36px]"
          >
            <div className="text-[24px] text-ink-muted">{metric.label}</div>
            <div className="mt-[20px] text-[72px] font-semibold leading-none text-ink">
              {metric.value}
            </div>
            {metric.detail ? (
              <div className="mt-[20px] text-[24px] leading-[1.3] text-ink-dim">
                {metric.detail}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {children ? (
        <div className="text-[30px] leading-[1.35] text-ink-muted">{children}</div>
      ) : null}
    </BaseSlideShell>
  );
}

export function ClosingSlideShell({
  children,
  className,
  ...props
}: Omit<BaseSlideShellProps, 'kind'>) {
  return (
    <BaseSlideShell
      kind="closing"
      spacious
      className={cn('justify-center bg-surface-canvas', className)}
      {...props}
    >
      {children ? (
        <div className="mt-[56px] max-w-[980px] text-[32px] leading-[1.3] text-ink-muted">
          {children}
        </div>
      ) : null}
    </BaseSlideShell>
  );
}
