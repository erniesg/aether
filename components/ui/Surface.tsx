import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export type SurfaceTone = 'bg' | 'panel' | 'panel-muted' | 'overlay' | 'canvas';
export type SurfaceTaxonomy = 'input' | 'output' | 'tool' | 'navigation' | 'metadata';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'aside' | 'header' | 'footer' | 'main' | 'nav';
  tone?: SurfaceTone;
  /** The taxonomy category this surface contains — mirrors CLAUDE.md hard rule 3. */
  taxonomy?: SurfaceTaxonomy;
  border?: 'none' | 'soft' | 'default' | 'strong';
  elevated?: boolean;
}

const toneStyles: Record<SurfaceTone, string> = {
  bg: 'bg-surface-bg',
  panel: 'bg-surface-panel',
  'panel-muted': 'bg-surface-panel-muted',
  overlay: 'bg-surface-overlay',
  canvas: 'bg-surface-canvas',
};

const borderStyles: Record<NonNullable<SurfaceProps['border']>, string> = {
  none: 'border-0',
  soft: 'border border-border-soft',
  default: 'border border-border',
  strong: 'border border-border-strong',
};

/**
 * Surface — the taxonomy-aware container primitive. Every panel in the shell
 * must be a Surface, which forces contributors to declare the panel's role
 * (input/output/tool/nav/metadata). The `data-taxonomy` attribute is read by
 * Playwright smoke tests to enforce the "no category mixing" rule.
 */
export function Surface({
  as: Tag = 'div',
  tone = 'panel',
  taxonomy,
  border = 'none',
  elevated = false,
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <Tag
      data-taxonomy={taxonomy}
      className={cn(
        toneStyles[tone],
        borderStyles[border],
        elevated ? 'shadow-md' : '',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
