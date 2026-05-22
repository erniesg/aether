import { Chip, type ChipTone } from '@/components/ui/Chip';
import type { EventRecapRunEvent, EventRunEventLevel } from '@/lib/research/event-recap/types';

/**
 * Phased run-event timeline — the creator-facing view of an event recap
 * refresh. Renders the structured events emitted by the pipeline so a run
 * reads as a sequence of stages, not raw JSON. Pure render; the surrounding
 * panel owns the collapse state (progressive disclosure, AGENTS.md).
 */

const LEVEL_TONE: Record<EventRunEventLevel, ChipTone> = {
  debug: 'neutral',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

const LEVEL_GLYPH: Record<EventRunEventLevel, string> = {
  debug: '·',
  info: '✓',
  warn: '⚠',
  error: '✗',
};

export interface RunEventSummary {
  steps: number;
  warnings: number;
  errors: number;
  status: 'running' | 'done' | 'failed';
  lastMessage?: string;
}

/** Collapse a run-event list into a one-line status for a compact header. */
export function summarizeRunEvents(events: EventRecapRunEvent[]): RunEventSummary {
  const warnings = events.filter((event) => event.level === 'warn').length;
  const errors = events.filter((event) => event.level === 'error').length;
  const failed = events.some((event) => event.tag === 'run.fail');
  const done = events.some((event) => event.tag === 'run.done');
  return {
    steps: events.length,
    warnings,
    errors,
    status: failed ? 'failed' : done ? 'done' : 'running',
    lastMessage: events[events.length - 1]?.message,
  };
}

export function RunEventTimeline({
  events,
  limit = 80,
}: {
  events: EventRecapRunEvent[];
  limit?: number;
}) {
  if (!events.length) {
    return <p className="font-caption text-xs text-ink-dim">no run steps recorded yet</p>;
  }
  const shown = events.slice(-limit);
  const hidden = events.length - shown.length;

  return (
    <ol className="flex flex-col gap-1">
      {shown.map((event) => (
        <li
          key={event.id}
          data-event-tag={event.tag}
          data-event-level={event.level}
          className="flex items-start gap-2"
        >
          <Chip tone={LEVEL_TONE[event.level]} size="sm" variant="ghost">
            {LEVEL_GLYPH[event.level]}
          </Chip>
          <span className="shrink-0 font-mono text-2xs uppercase text-ink-dim">
            {event.tag}
            {event.platform ? ` · ${event.platform}` : ''}
          </span>
          <span className="min-w-0 flex-1 font-caption text-xs leading-5 text-ink-muted">
            {event.message}
          </span>
        </li>
      ))}
      {hidden > 0 ? (
        <li className="font-caption text-2xs text-ink-dim">
          showing latest {shown.length} of {events.length} steps
        </li>
      ) : null}
    </ol>
  );
}
