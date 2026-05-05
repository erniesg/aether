'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, List, Loader2, Mic, MicOff, Search, X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import type { ReferenceRecord } from '@/lib/providers/reference/types';
import {
  buildVoiceGenerationPlan,
  type VoiceCommandContext,
  type VoiceCreatorCommand,
  type VoiceGenerationPlan,
  type VoiceCommandPublishMode,
} from '@/lib/voice/command';
import type { PublishPlatform } from '@/lib/providers/publisher/types';
import type { VoiceReferenceSearchResult } from '@/lib/voice/reference-search';
import { cn } from '@/lib/utils/cn';

type AsyncVoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'interpreting'
  | 'searching'
  | 'reviewing'
  | 'dispatching'
  | 'error';

type VoiceHistoryItem = {
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'error';
};

type VoiceReferenceCandidate = {
  url: string;
  score?: number;
  record?: ReferenceRecord;
};

type VoiceReviewDecision =
  | { action: 'continue'; selectedUrls: string[] }
  | { action: 'without-refs'; selectedUrls: [] }
  | { action: 'cancel'; selectedUrls: [] };

type VoiceReviewState = {
  command: VoiceCreatorCommand;
  candidates: VoiceReferenceCandidate[];
  selectedUrls: string[];
  reason: string;
};

type VoicePublishClarificationState = {
  command: VoiceCreatorCommand;
};

export interface VoiceRunTrace {
  transcript: string;
  interpretedCommand: VoiceCreatorCommand;
  productResolution?: VoiceCreatorCommand['product'];
  referenceCandidates: Array<{
    url: string;
    score?: number;
    productId?: string;
    status?: ReferenceRecord['referenceStatus'];
  }>;
  selectedRefs: Array<{ url: string; score?: number; productId?: string }>;
  finalGeneratePrompt: string;
  publishMode: Exclude<VoiceCommandPublishMode, 'ask'>;
  targetPlatforms?: PublishPlatform[];
}

export interface AsyncVoiceRecorder {
  start(): Promise<void> | void;
  stop(): Promise<Blob>;
}

export interface AsyncPushToTalkDeps {
  createRecorder?: () => AsyncVoiceRecorder;
  transcribe?: (audio: Blob) => Promise<{ text: string }>;
  interpret?: (
    transcript: string,
    context: VoiceCommandContext
  ) => Promise<VoiceCreatorCommand>;
  findReferences?: (
    query: string,
    context: VoiceCommandContext,
    libraryReferences: ReadonlyArray<ReferenceRecord>,
    product?: VoiceCreatorCommand['product']
  ) => Promise<VoiceReferenceSearchResult>;
}

export interface AsyncVoiceGenerateRequest {
  prompt: string;
  options: VoiceGenerationPlan['options'];
  command: VoiceCreatorCommand;
  trace: VoiceRunTrace;
}

export interface AsyncPushToTalkProps {
  context: VoiceCommandContext;
  onGenerate: (request: AsyncVoiceGenerateRequest) => void | Promise<void>;
  onReference?: (record: ReferenceRecord) => void;
  libraryReferences?: ReadonlyArray<ReferenceRecord>;
  clarifyPublishMode?: (
    command: VoiceCreatorCommand
  ) => Promise<'review' | 'auto-post'> | 'review' | 'auto-post';
  deps?: AsyncPushToTalkDeps;
  className?: string;
}

class BrowserVoiceRecorder implements AsyncVoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('microphone is unavailable');
    }
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('audio recording is unavailable');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(new Blob([], { type: 'audio/webm' }));
    return new Promise((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          this.stream?.getTracks().forEach((track) => track.stop());
          this.stream = null;
          this.recorder = null;
          const type = this.chunks[0]?.type || 'audio/webm';
          resolve(new Blob(this.chunks, { type }));
        },
        { once: true }
      );
      recorder.stop();
    });
  }
}

function defaultCreateRecorder(): AsyncVoiceRecorder {
  return new BrowserVoiceRecorder();
}

async function defaultTranscribe(audio: Blob): Promise<{ text: string }> {
  const form = new FormData();
  form.append('file', audio, 'voice-command.webm');
  const res = await fetch('/api/voice/transcribe', {
    method: 'POST',
    body: form,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    transcript?: string;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.transcript) {
    throw new Error(json.error ?? `transcription failed (${res.status})`);
  }
  return { text: json.transcript };
}

async function defaultInterpret(
  transcript: string,
  context: VoiceCommandContext
): Promise<VoiceCreatorCommand> {
  const res = await fetch('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, context }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    command?: VoiceCreatorCommand;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.command) {
    throw new Error(json.error ?? `command interpretation failed (${res.status})`);
  }
  return json.command;
}

async function defaultFindReferences(
  query: string,
  context: VoiceCommandContext,
  libraryReferences: ReadonlyArray<ReferenceRecord>,
  product?: VoiceCreatorCommand['product']
): Promise<VoiceReferenceSearchResult> {
  const res = await fetch('/api/voice/references', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: 4,
      workspaceId: context.workspaceId,
      libraryReferences: compactLibraryReferences(libraryReferences),
      product,
    }),
  });
  const json = (await res.json()) as Partial<VoiceReferenceSearchResult> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `reference search failed (${res.status})`);
  }
  return {
    status: json.status ?? 'empty',
    references: json.references ?? [],
    records: json.records ?? [],
    warning: json.warning,
  };
}

function compactLibraryReferences(
  records: ReadonlyArray<ReferenceRecord>
): ReferenceRecord[] {
  return records
    .filter((record) => !record.previewUrl.startsWith('data:'))
    .slice(0, 40)
    .map((record) => ({
      ...record,
      tags: record.tags ?? [],
      notes: record.notes?.slice(0, 240),
    }));
}

const STATE_LABEL: Record<AsyncVoiceState, string> = {
  idle: 'hold to speak',
  listening: 'listening',
  transcribing: 'transcribing',
  interpreting: 'reading intent',
  searching: 'finding refs',
  reviewing: 'review refs',
  dispatching: 'generating',
  error: 'voice error',
};

const AUTO_SELECT_REF_SCORE = 0.78;
const PRODUCT_REVIEW_CONFIDENCE = 0.9;
const COMMAND_REVIEW_CONFIDENCE = 0.7;

function candidateScore(candidate: VoiceReferenceCandidate): number {
  return typeof candidate.score === 'number' && Number.isFinite(candidate.score)
    ? candidate.score
    : 0;
}

function scoreLabel(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'unscored';
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

function referenceUrl(record: ReferenceRecord | undefined): string | undefined {
  return record?.fullUrl?.trim() || record?.previewUrl?.trim();
}

function candidatesFromSearchResult(
  result: VoiceReferenceSearchResult
): VoiceReferenceCandidate[] {
  return result.references.map((hit, index) => {
    const record =
      result.records.find((entry) => {
        const url = referenceUrl(entry);
        return url === hit.url || entry.previewUrl === hit.url || entry.fullUrl === hit.url;
      }) ?? result.records[index];
    return {
      url: hit.url,
      score: hit.score ?? record?.relevanceScore,
      record,
    };
  });
}

function selectedUrlsForAutomatedPath(
  command: VoiceCreatorCommand,
  candidates: ReadonlyArray<VoiceReferenceCandidate>
): string[] {
  const productConfidence = command.product?.confidence ?? 0;
  if (productConfidence < PRODUCT_REVIEW_CONFIDENCE) return [];
  return candidates
    .filter((candidate) => candidateScore(candidate) >= AUTO_SELECT_REF_SCORE)
    .slice(0, 3)
    .map((candidate) => candidate.url);
}

function reviewReason(
  command: VoiceCreatorCommand,
  candidates: ReadonlyArray<VoiceReferenceCandidate>,
  selectedUrls: ReadonlyArray<string>
): string | null {
  if (!command.product) return 'confirm product';
  if ((command.product.confidence ?? 0) < PRODUCT_REVIEW_CONFIDENCE) {
    return 'confirm product';
  }
  if (command.confidence < COMMAND_REVIEW_CONFIDENCE) return 'confirm intent';
  if (candidates.length > 0 && selectedUrls.length === 0) return 'choose refs';
  return null;
}

function selectedReferenceRecord(
  candidate: VoiceReferenceCandidate,
  command: VoiceCreatorCommand
): ReferenceRecord | null {
  const record = candidate.record;
  if (!record) return null;
  return {
    ...record,
    productId: record.productId ?? command.product?.id,
    productCanonicalName:
      record.productCanonicalName ?? command.product?.canonicalName,
    referenceQuery: record.referenceQuery ?? command.referenceSearchQuery,
    relevanceScore: candidate.score ?? record.relevanceScore,
    referenceStatus: 'selected',
  };
}

export function AsyncPushToTalk({
  context,
  onGenerate,
  onReference,
  libraryReferences = [],
  clarifyPublishMode,
  deps,
  className,
}: AsyncPushToTalkProps) {
  const [state, setState] = useState<AsyncVoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [chips, setChips] = useState<Array<{ label: string; value: string }>>([]);
  const [history, setHistory] = useState<VoiceHistoryItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [review, setReview] = useState<VoiceReviewState | null>(null);
  const [publishClarification, setPublishClarification] =
    useState<VoicePublishClarificationState | null>(null);
  const recorderRef = useRef<AsyncVoiceRecorder | null>(null);
  const processingRef = useRef(false);
  const reviewResolverRef = useRef<((decision: VoiceReviewDecision) => void) | null>(
    null
  );
  const publishResolverRef = useRef<
    ((decision: Exclude<VoiceCommandPublishMode, 'ask'>) => void) | null
  >(null);

  const icon = useMemo(() => {
    if (state === 'error') return <MicOff size={14} strokeWidth={1.75} />;
    if (
      state === 'transcribing' ||
      state === 'interpreting' ||
      state === 'reviewing' ||
      state === 'dispatching'
    ) {
      return <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />;
    }
    if (state === 'searching') return <Search size={14} strokeWidth={1.75} />;
    return <Mic size={14} strokeWidth={1.75} />;
  }, [state]);

  const start = useCallback(async () => {
    if (processingRef.current || state !== 'idle') return;
    setError(null);
    setChips([{ label: 'voice', value: 'listening' }]);
    setHistory([{ label: 'voice', value: 'listening' }]);
    try {
      const recorder = deps?.createRecorder?.() ?? defaultCreateRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      setState('listening');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [deps, state]);

  const askForReview = useCallback(
    (request: VoiceReviewState): Promise<VoiceReviewDecision> => {
      setState('reviewing');
      setExpanded(true);
      setReview(request);
      return new Promise((resolve) => {
        reviewResolverRef.current = resolve;
      });
    },
    []
  );

  const resolveReview = useCallback((decision: VoiceReviewDecision) => {
    const resolve = reviewResolverRef.current;
    reviewResolverRef.current = null;
    setReview(null);
    resolve?.(decision);
  }, []);

  const askForPublishMode = useCallback((command: VoiceCreatorCommand) => {
    setState('reviewing');
    setExpanded(true);
    setPublishClarification({ command });
    setHistory((items) => [
      ...items,
      { label: 'publish', value: 'needs timing choice' },
    ]);
    return new Promise<Exclude<VoiceCommandPublishMode, 'ask'>>((resolve) => {
      publishResolverRef.current = resolve;
    });
  }, []);

  const resolvePublishClarification = useCallback(
    (decision: Exclude<VoiceCommandPublishMode, 'ask'>) => {
      const resolve = publishResolverRef.current;
      publishResolverRef.current = null;
      setPublishClarification(null);
      resolve?.(decision);
    },
    []
  );

  const stop = useCallback(async () => {
    if (state !== 'listening' || processingRef.current) return;
    processingRef.current = true;
    try {
      setState('transcribing');
      setChips([{ label: 'voice', value: 'transcribing' }]);
      const audio = await recorderRef.current!.stop();

      const transcribe = deps?.transcribe ?? defaultTranscribe;
      const interpret = deps?.interpret ?? defaultInterpret;
      const findReferences = deps?.findReferences ?? defaultFindReferences;

      const transcript = (await transcribe(audio)).text.trim();
      setState('interpreting');
      setChips([{ label: 'transcript', value: transcript }]);
      setHistory((items) => [
        ...items,
        { label: 'transcript', value: transcript, tone: 'ok' },
      ]);

      const command = await interpret(transcript, context);
      setHistory((items) => [
        ...items,
        {
          label: 'intent',
          value:
            command.action === 'generate-socials'
              ? `generate socials · ${command.brief || 'open brief'}`
              : command.action,
          tone: command.action === 'unknown' ? 'error' : 'ok',
        },
      ]);
      const product = command.product;
      if (product) {
        setHistory((items) => [
          ...items,
          {
            label: 'product',
            value:
              product.source === 'research'
                ? `${product.canonicalName} · researched`
                : product.canonicalName,
            tone: 'ok',
          },
        ]);
      }
      let publishMode: Exclude<VoiceCommandPublishMode, 'ask'> =
        command.publishMode === 'auto-post' ? 'auto-post' : 'review';
      if (command.publishMode === 'ask') {
        publishMode = await (clarifyPublishMode ?? askForPublishMode)(command);
      }
      setHistory((items) => [
        ...items,
        {
          label: 'publish',
          value:
            publishMode === 'auto-post'
              ? command.targetPlatforms?.length
                ? `post after generation · ${command.targetPlatforms.join(', ')}`
                : 'post after generation'
              : 'hold for review after generation',
        },
      ]);

      let refUrls: string[] = [];
      let referenceCandidates: VoiceReferenceCandidate[] = [];
      let reviewedSelection = false;
      if (command.referenceSearchQuery) {
        const referenceQuery = command.referenceSearchQuery;
        setState('searching');
        setHistory((items) => [
          ...items,
          { label: 'references', value: referenceQuery },
        ]);
        const result = await findReferences(
          referenceQuery,
          context,
          libraryReferences,
          command.product
        );
        referenceCandidates = candidatesFromSearchResult(result);
        refUrls = selectedUrlsForAutomatedPath(command, referenceCandidates);
        const reason = reviewReason(command, referenceCandidates, refUrls);
        if (reason) {
          const decision = await askForReview({
            command,
            candidates: referenceCandidates,
            selectedUrls: refUrls,
            reason,
          });
          reviewedSelection = true;
          if (decision.action === 'cancel') {
            setHistory((items) => [
              ...items,
              { label: 'generation', value: 'cancelled', tone: 'neutral' },
            ]);
            setState('idle');
            return;
          }
          refUrls =
            decision.action === 'without-refs' ? [] : decision.selectedUrls;
        }
        if (reviewedSelection) {
          for (const candidate of referenceCandidates) {
            if (!refUrls.includes(candidate.url)) continue;
            const record = selectedReferenceRecord(candidate, command);
            if (record) onReference?.(record);
          }
        }
        setHistory((items) => [
          ...items,
          {
            label: 'references',
            value:
              refUrls.length > 0
                ? `${refUrls.length} selected`
                : 'none found · generating without refs',
            tone: refUrls.length > 0 ? 'ok' : 'neutral',
          },
        ]);
      }

      const plan = buildVoiceGenerationPlan(command, {
        ...context,
        referenceUrls: refUrls,
        publishMode,
      });
      const selectedRefs = referenceCandidates.filter((candidate) =>
        refUrls.includes(candidate.url)
      );
      const trace: VoiceRunTrace = {
        transcript,
        interpretedCommand: command,
        productResolution: command.product,
        referenceCandidates: referenceCandidates.map((candidate) => ({
          url: candidate.url,
          score: candidate.score,
          productId: candidate.record?.productId ?? command.product?.id,
          status: candidate.record?.referenceStatus ?? 'candidate',
        })),
        selectedRefs: selectedRefs.map((candidate) => ({
          url: candidate.url,
          score: candidate.score,
          productId: candidate.record?.productId ?? command.product?.id,
        })),
        finalGeneratePrompt: plan.prompt,
        publishMode,
        targetPlatforms: command.targetPlatforms,
      };
      setChips(plan.statusChips);
      setHistory((items) => [
        ...items,
        {
          label: 'formats',
          value: `${context.formats.length || 1} target${(context.formats.length || 1) === 1 ? '' : 's'}`,
        },
        {
          label: 'languages',
          value:
            plan.statusChips.find((chip) => chip.label === 'languages')?.value ??
            context.locales[0] ??
            'default',
        },
        ...(plan.statusChips.find((chip) => chip.label === 'platforms')
          ? [
              {
                label: 'platforms',
                value: plan.statusChips.find((chip) => chip.label === 'platforms')!.value,
              },
            ]
          : []),
        {
          label: 'generation',
          value: 'sent to canvas · first frames usually take 2-3 min',
          tone: 'ok',
        },
      ]);
      setState('dispatching');
      await onGenerate({ prompt: plan.prompt, options: plan.options, command, trace });
      setState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setHistory((items) => [
        ...items,
        { label: 'error', value: message, tone: 'error' },
      ]);
      setState('error');
    } finally {
      processingRef.current = false;
      recorderRef.current = null;
    }
  }, [
    clarifyPublishMode,
    askForPublishMode,
    context,
    deps,
    libraryReferences,
    onGenerate,
    onReference,
    askForReview,
    state,
  ]);

  const label = error
    ? `voice command · error · ${error}`
    : `voice command · ${STATE_LABEL[state]}`;

  const toggleReviewUrl = useCallback((url: string) => {
    setReview((current) => {
      if (!current) return current;
      const selected = new Set(current.selectedUrls);
      if (selected.has(url)) selected.delete(url);
      else selected.add(url);
      return { ...current, selectedUrls: Array.from(selected) };
    });
  }, []);

  return (
    <div className={cn('relative flex items-center gap-1', className)}>
      <IconButton
        label={label}
        icon={icon}
        active={state !== 'idle'}
        variant={state === 'listening' ? 'outline' : 'ghost'}
        onPointerDown={() => {
          void start();
        }}
        onPointerUp={() => {
          void stop();
        }}
        onPointerLeave={() => {
          void stop();
        }}
        data-async-voice-state={state}
      />
      {chips.length > 0 || error ? (
        <div
          data-async-voice-status
          className="flex max-w-[280px] items-center gap-1 overflow-hidden"
        >
          {error ? (
            <span className="truncate rounded-pill border border-signal-error/30 bg-signal-error/5 px-1.5 py-0.5 font-caption text-2xs text-signal-error">
              {error}
            </span>
          ) : (
            chips.slice(0, 5).map((chip) => (
              <span
                key={`${chip.label}:${chip.value}`}
                className="max-w-[130px] truncate rounded-pill border border-border-soft bg-surface-panel-muted px-1.5 py-0.5 font-caption text-2xs text-ink-dim"
                title={`${chip.label}: ${chip.value}`}
              >
                {chip.value}
              </span>
            ))
          )}
        </div>
      ) : null}
      {history.length > 0 ? (
        <button
          type="button"
          aria-label="show voice command details"
          title="show voice command details"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-soft',
            'bg-surface-panel text-ink-dim transition-colors duration-fast ease-quick hover:border-border hover:text-ink',
            expanded && 'border-accent text-accent'
          )}
        >
          <List size={13} strokeWidth={1.75} />
        </button>
      ) : null}
      {publishClarification ? (
        <div
          data-async-voice-publish
          data-testid="async-voice-publish-ready"
          className="absolute bottom-[calc(100%+8px)] right-0 z-[1000] w-[min(420px,calc(100vw-32px))] rounded-sm border border-border-soft bg-surface-panel p-2 opacity-100 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-caption text-[10px] uppercase text-ink-faint">
                publish check
              </div>
              <div className="mt-0.5 truncate font-caption text-xs text-ink">
                {publishClarification.command.brief || 'voice generation'}
              </div>
              <div className="mt-0.5 font-caption text-[11px] text-ink-dim">
                Assets are not ready yet. Choose what should happen after the canvas finishes.
              </div>
            </div>
            <button
              type="button"
              aria-label="hold publish for review"
              onClick={() => resolvePublishClarification('review')}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-soft text-ink-dim hover:border-border hover:text-ink"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            <button
              type="button"
              onClick={() => resolvePublishClarification('review')}
              className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink-dim hover:border-border hover:text-ink"
            >
              hold for review
            </button>
            <button
              type="button"
              onClick={() => resolvePublishClarification('auto-post')}
              className="rounded-sm border border-accent bg-accent px-2 py-1 font-caption text-xs text-white hover:bg-accent/90"
            >
              post after generation
            </button>
          </div>
        </div>
      ) : null}
      {review ? (
        <div
          data-async-voice-review
          data-testid="async-voice-review-ready"
          className="absolute bottom-[calc(100%+8px)] right-0 z-[1000] w-[min(460px,calc(100vw-32px))] rounded-sm border border-border-soft bg-surface-panel p-2 opacity-100 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-caption text-[10px] uppercase text-ink-faint">
                voice check
              </div>
              <div className="mt-0.5 truncate font-caption text-xs text-ink">
                {review.command.product
                  ? `${review.command.product.canonicalName} · ${scoreLabel(review.command.product.confidence)}`
                  : 'product uncertain'}
              </div>
              <div className="mt-0.5 font-caption text-[11px] text-ink-dim">
                {review.reason === 'choose refs'
                  ? 'Choose which references should guide this generation.'
                  : 'Confirm the product and references before generating.'}
              </div>
            </div>
            <button
              type="button"
              aria-label="cancel voice generation"
              onClick={() => resolveReview({ action: 'cancel', selectedUrls: [] })}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-soft text-ink-dim hover:border-border hover:text-ink"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>

          {review.candidates.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {review.candidates.map((candidate) => {
                const selected = review.selectedUrls.includes(candidate.url);
                return (
                  <button
                    key={candidate.url}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${selected ? 'remove' : 'keep'} reference ${scoreLabel(candidate.score)}`}
                    onClick={() => toggleReviewUrl(candidate.url)}
                    className={cn(
                      'group relative overflow-hidden rounded-sm border bg-surface-panel-muted opacity-100 text-left transition-colors',
                      selected
                        ? 'border-accent ring-1 ring-accent/35'
                        : 'border-border-soft hover:border-border'
                    )}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-black/5">
                      <img
                        src={candidate.url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                      <span className="truncate font-caption text-[10px] text-ink-dim">
                        {candidate.record?.title ?? 'reference'}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-pill border px-1 py-0.5 font-caption text-[10px]',
                          selected
                            ? 'border-accent/40 text-accent'
                            : 'border-border-soft text-ink-faint'
                        )}
                      >
                        {scoreLabel(candidate.score)}
                      </span>
                    </div>
                    {selected ? (
                      <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-accent text-white">
                        <Check size={12} strokeWidth={2} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 rounded-sm border border-border-soft bg-surface-panel-muted px-2 py-2 font-caption text-xs text-ink-dim">
              No useful visual references were found. You can still generate from the
              brief.
            </div>
          )}

          <div className="mt-2 flex flex-wrap justify-end gap-1">
            <button
              type="button"
              onClick={() => resolveReview({ action: 'without-refs', selectedUrls: [] })}
              className="rounded-sm border border-border-soft bg-surface-panel px-2 py-1 font-caption text-xs text-ink-dim hover:border-border hover:text-ink"
            >
              no refs
            </button>
            <button
              type="button"
              onClick={() =>
                resolveReview({
                  action: 'continue',
                  selectedUrls: review.selectedUrls,
                })
              }
              className="rounded-sm border border-accent bg-accent px-2 py-1 font-caption text-xs text-white hover:bg-accent/90"
            >
              use selected
            </button>
          </div>
        </div>
      ) : null}
      {expanded && history.length > 0 && !review && !publishClarification ? (
        <div
          data-async-voice-history
          className="absolute bottom-[calc(100%+8px)] right-0 z-[1000] w-[min(380px,calc(100vw-32px))] rounded-sm border border-border-soft bg-surface-panel p-2 opacity-100 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="font-caption text-[10px] uppercase text-ink-faint">
              voice command
            </span>
            <span className="font-caption text-[10px] text-ink-faint">
              {STATE_LABEL[state]}
            </span>
          </div>
          <ol className="flex max-h-64 flex-col gap-1 overflow-auto pr-1">
            {history.map((item, index) => (
              <li
                key={`${item.label}-${index}`}
                className={cn(
                  'rounded-xs border border-border-soft bg-surface-panel-muted px-2 py-1',
                  item.tone === 'ok' && 'border-signal-ok/20',
                  item.tone === 'error' && 'border-signal-error/25 bg-signal-error/5'
                )}
              >
                <div className="font-caption text-[10px] uppercase text-ink-faint">
                  {item.label}
                </div>
                <div
                  className={cn(
                    'mt-0.5 whitespace-pre-wrap break-words font-caption text-[11px]',
                    item.tone === 'error' ? 'text-signal-error' : 'text-ink'
                  )}
                >
                  {item.value}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
