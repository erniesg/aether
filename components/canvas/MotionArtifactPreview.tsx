'use client';

import { Volume2, X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils/cn';

export interface MotionArtifact {
  id: string;
  runId?: string;
  title: string;
  sceneKind: 'text-mask' | 'double-exposure';
  html: string;
  artifactUrl: string;
  posterUrl?: string;
  provider: string;
  model: string;
  durationSec: number;
  width: number;
  height: number;
  audioIncluded: boolean;
  sourceRef?: string;
}

export interface MotionArtifactPreviewProps {
  artifact: MotionArtifact;
  onDismiss?: () => void;
  className?: string;
}

export function MotionArtifactPreview({
  artifact,
  onDismiss,
  className,
}: MotionArtifactPreviewProps) {
  return (
    <section
      role="region"
      aria-label="motion artifact"
      data-taxonomy="output"
      className={cn(
        'pointer-events-auto absolute bottom-4 right-4 z-20 w-[min(420px,calc(100%-32px))] overflow-hidden rounded-md border border-border bg-surface-panel shadow-lg',
        className
      )}
    >
      <div className="relative aspect-video bg-ink">
        <iframe
          title={artifact.title}
          srcDoc={artifact.html}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay"
          className="h-full w-full border-0"
        />
        {artifact.sourceRef ? (
          <span className="pointer-events-none absolute left-2 top-2 h-10 w-10 overflow-hidden rounded-xs border border-white/70 bg-ink shadow-md">
            <img
              src={artifact.sourceRef}
              alt=""
              data-testid="motion-source-ref"
              className="h-full w-full object-cover"
            />
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-caption text-ink">{artifact.title}</div>
          <div className="mt-0.5 flex items-center gap-1 font-mono text-2xs uppercase tracking-wide text-ink-dim">
            <span>{artifact.provider}</span>
            <span className="text-ink-faint">·</span>
            <span>{artifact.durationSec.toFixed(0)}s</span>
            {artifact.audioIncluded ? (
              <>
                <span className="text-ink-faint">·</span>
                <span className="inline-flex items-center gap-1 text-accent">
                  <Volume2 size={10} strokeWidth={1.8} />
                  sound
                </span>
              </>
            ) : null}
          </div>
        </div>
        {onDismiss ? (
          <IconButton
            label="dismiss motion artifact"
            icon={<X size={13} strokeWidth={1.8} />}
            onClick={onDismiss}
          />
        ) : null}
      </div>
    </section>
  );
}
