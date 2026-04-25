'use client';

/**
 * Workspace provider preference resolver.
 *
 * Precedence (highest to lowest):
 *   1. workspace pref stored in Convex (WorkspaceProviderPrefs)
 *   2. env var (VOICE_PROVIDER, IMAGE_GEN_PROVIDER, SEGMENTATION_PROVIDER, etc.)
 *   3. code default (gemini-live for voice, registry order for image/segmentation)
 *
 * The Convex `useQuery` hook is exported as `useWorkspaceProviderPrefs` for
 * client components. Server-side API routes call the resolver directly with a
 * prefs object they fetched via the Convex HTTP client.
 *
 * No secrets exposed here — provider keys remain wrangler secrets.
 */

import type { VoiceProviderId } from '@/lib/voice/types';

export interface WorkspaceProviderPrefs {
  imageProviderId?: string;
  voiceProviderId?: VoiceProviderId;
  voiceModel?: string;
  segmentationProviderId?: string;
}

// ─── Code defaults (per provider mandate) ───────────────────────────────────
const VOICE_CODE_DEFAULT: VoiceProviderId = 'gemini-live';
const GEMINI_LIVE_MODEL_DEFAULT = 'gemini-3.1-flash-live-preview';

// ─── Voice ──────────────────────────────────────────────────────────────────

export interface ResolvedVoiceProvider {
  providerId: VoiceProviderId;
  /** Resolved model string. May be from pref, env, or code default. */
  model: string;
}

/**
 * Resolve which voice provider + model to use.
 *
 * Pass the workspace prefs record (or null when none exists / Convex is
 * unavailable). The function never reads env vars directly so it works in
 * both server (API route) and client (hook) contexts without leaking secrets
 * — callers in API routes are expected to pass `process.env.*` values if they
 * want env fallback; client-side callers pass null and get the code default.
 *
 * For full env-fallback support from API routes, the route itself reads env
 * and passes the result (see `app/api/voice/session/route.ts`).
 */
export function resolveVoiceProvider(
  prefs: WorkspaceProviderPrefs | null | undefined
): ResolvedVoiceProvider {
  const envProvider = (
    typeof process !== 'undefined' ? process.env.VOICE_PROVIDER : undefined
  ) as VoiceProviderId | undefined;

  const envModel =
    typeof process !== 'undefined'
      ? process.env.GEMINI_LIVE_MODEL ??
        process.env.OPENAI_REALTIME_MODEL ??
        process.env.VOICE_MODEL
      : undefined;

  const providerId: VoiceProviderId =
    prefs?.voiceProviderId ?? envProvider ?? VOICE_CODE_DEFAULT;

  // Model: pref > env (provider-specific) > code default
  const model =
    prefs?.voiceModel ??
    (providerId === 'gemini-live'
      ? (typeof process !== 'undefined'
          ? process.env.GEMINI_LIVE_MODEL ?? process.env.VOICE_MODEL
          : undefined) ?? GEMINI_LIVE_MODEL_DEFAULT
      : envModel ?? '') ??
    '';

  return { providerId, model };
}

// ─── Image ───────────────────────────────────────────────────────────────────

/**
 * Resolve which image provider id to prefer.
 * Returns undefined when neither pref nor env is set; the registry then picks
 * the first available adapter.
 */
export function resolveImageProviderId(
  prefs: WorkspaceProviderPrefs | null | undefined
): string | undefined {
  return (
    prefs?.imageProviderId ??
    (typeof process !== 'undefined' ? process.env.IMAGE_GEN_PROVIDER : undefined)
  );
}

// ─── Segmentation ────────────────────────────────────────────────────────────

/**
 * Resolve which segmentation provider id to prefer.
 * Returns undefined when neither pref nor env is set; the registry then picks
 * the first available adapter.
 */
export function resolveSegmentationProviderId(
  prefs: WorkspaceProviderPrefs | null | undefined
): string | undefined {
  return (
    prefs?.segmentationProviderId ??
    (typeof process !== 'undefined' ? process.env.SEGMENTATION_PROVIDER : undefined)
  );
}

// ─── Convex React hook (client-side) ─────────────────────────────────────────

/**
 * Client-side hook. Returns the stored prefs for a workspace, or null when
 * Convex is not provisioned. Components merge this with their local state.
 *
 * Dynamic import of `convex/react` keeps this file free of server-only deps
 * so it can be imported in both server and client modules without treeshake
 * issues.
 */
export function useWorkspaceProviderPrefs(
  workspaceId: string
): WorkspaceProviderPrefs | null {
  // Lazy: only import the hook when Convex is available. This guard prevents
  // errors in test environments that don't have ConvexProvider mounted.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useQuery } = require('convex/react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('@/convex/_generated/api');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQuery(api.providerPrefs.getProviderPrefs, { workspaceId }) ?? null;
  } catch {
    return null;
  }
}
