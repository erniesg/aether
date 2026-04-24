import type { GuardedLayoutPlan } from '@/lib/canvas/layoutGuard';
import type { CapabilityRunRecord } from '@/lib/store/runs.types';

export type ManagedScheduleStatus = 'ready' | 'needs-output' | 'needs-layout' | 'blocked';

export interface ManagedScheduleSlot {
  id: string;
  platform: string;
  format: string;
  scheduledFor: string;
  status: ManagedScheduleStatus;
}

export interface ManagedScheduleDraft {
  status: ManagedScheduleStatus;
  readyCount: number;
  totalCount: number;
  slots: ManagedScheduleSlot[];
  validation: {
    hasOutput: boolean;
    layoutStatus: GuardedLayoutPlan['status'] | 'missing';
    issueCount: number;
  };
}

const SLOT_TIMES = ['09:12', '11:40', '14:20', '16:45', '18:05'];

function platformForFormat(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('story')) return 'Instagram Story';
  if (lower.includes('reel')) return 'Instagram Reels';
  if (lower.includes('linkedin')) return 'LinkedIn';
  if (lower.includes('tiktok')) return 'TikTok';
  if (lower.includes('ig') || lower.includes('instagram')) return 'Instagram Feed';
  return 'Social';
}

function nextIsoAtLocalTime(dayOffset: number, hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function hasCompletedCreativeOutput(runs: ReadonlyArray<CapabilityRunRecord>): boolean {
  return runs.some(
    (run) =>
      run.status === 'ok' &&
      (run.artifactKind === 'image' || run.artifactKind === 'video' || run.imageUrl)
  );
}

export function buildManagedScheduleDraft(input: {
  formats: ReadonlyArray<{ id: string; label?: string }>;
  runs: ReadonlyArray<CapabilityRunRecord>;
  layoutPlan?: GuardedLayoutPlan | null;
}): ManagedScheduleDraft {
  const hasOutput = hasCompletedCreativeOutput(input.runs);
  const layoutStatus = input.layoutPlan?.status ?? 'missing';
  const layoutReady = layoutStatus === 'ready' || layoutStatus === 'review';
  const baseStatus: ManagedScheduleStatus = !hasOutput
    ? 'needs-output'
    : !layoutReady
      ? layoutStatus === 'blocked'
        ? 'blocked'
        : 'needs-layout'
      : 'ready';

  const slots = input.formats.map((format, index) => ({
    id: `schedule-${format.id}`,
    platform: platformForFormat(format.label ?? format.id),
    format: format.label ?? format.id,
    scheduledFor: nextIsoAtLocalTime(index === 0 ? 1 : 1 + Math.floor(index / 4), SLOT_TIMES[index % SLOT_TIMES.length]),
    status: baseStatus,
  }));

  return {
    status: baseStatus,
    readyCount: slots.filter((slot) => slot.status === 'ready').length,
    totalCount: slots.length,
    slots,
    validation: {
      hasOutput,
      layoutStatus,
      issueCount: input.layoutPlan?.issues.length ?? 0,
    },
  };
}

export function formatScheduleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
