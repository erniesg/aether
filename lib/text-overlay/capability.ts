/**
 * `text-apply` capability stub. Real executor lands in T4 / T5 / T9 — this
 * file exists so downstream slices can import stable entry points and so
 * tests can verify that a `text-apply` `capabilityRun` row round-trips
 * through the registry.
 *
 * The stub:
 * - returns a canned `AetherTextPlacement` (centered, smart) and the
 *   merged style;
 * - records a `capabilityRun` row via the provided sink so the agent can
 *   replay the intent later.
 */
import type {
  AetherTextPlacement,
  BCP47LocaleCode,
  TextOverlayStyle,
  TextApplyCapabilityRun,
} from './types';

export interface TextApplyInputs {
  /** Existing layer to mutate. When absent, the stub returns a fresh placement. */
  layerId?: string;
  content: Record<BCP47LocaleCode, string>;
  activeLanguage: BCP47LocaleCode;
  style: Partial<TextOverlayStyle>;
  placement?: Partial<AetherTextPlacement>;
}

export interface TextApplyOutputs {
  layerId: string;
  placement: AetherTextPlacement;
  appliedStyle: TextOverlayStyle;
}

/** Sink the executor writes its provenance record to. Implemented by a real
 *  Convex mutation in prod and by an in-memory spy in tests. */
export type CapabilityRunSink = (record: TextApplyCapabilityRun) => void | Promise<void>;

const DEFAULT_STYLE = {
  fontFamily: 'Inter',
  fontSize: 64,
  fontWeight: 600,
  fontStyle: 'normal',
  letterSpacing: 0,
  lineHeight: 1.15,
  textAlign: 'center',
  color: '#111111',
} satisfies Omit<TextOverlayStyle, 'language'>;

const DEFAULT_PLACEMENT: AetherTextPlacement = {
  mode: 'smart',
  anchor: { normalizedX: 0.5, normalizedY: 0.5, relativeTo: 'artboard' },
  rotation: 0,
  width: 'auto',
};

export interface ExecuteTextApplyOptions {
  /** Persist the run-intent record. Real executor wires to convex/textOverlay. */
  recordRun?: CapabilityRunSink;
  /** Stable id for the returned layer when the input omits one. Deterministic ids keep tests clean. */
  mintLayerId?: () => string;
}

export async function executeTextApply(
  inputs: TextApplyInputs,
  options: ExecuteTextApplyOptions = {}
): Promise<TextApplyOutputs> {
  const placement: AetherTextPlacement = {
    ...DEFAULT_PLACEMENT,
    ...inputs.placement,
    anchor: {
      ...DEFAULT_PLACEMENT.anchor,
      ...inputs.placement?.anchor,
    },
  };

  const appliedStyle: TextOverlayStyle = {
    ...DEFAULT_STYLE,
    ...inputs.style,
    language: inputs.activeLanguage,
  };

  const layerId = inputs.layerId ?? options.mintLayerId?.() ?? `text-overlay_stub_${Date.now()}`;

  const outputs: TextApplyOutputs = { layerId, placement, appliedStyle };

  const record: TextApplyCapabilityRun = {
    entryRef: { kind: 'tool', id: 'text-apply', version: 1 },
    inputs,
    outputs,
    beforeSnapshotRef: null,
    afterSnapshotRef: null,
    status: 'draft-executor',
  };

  if (options.recordRun) await options.recordRun(record);

  return outputs;
}
