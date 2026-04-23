import type { VoiceToolDefinition } from './types';

/**
 * The safe verb set the realtime model can call today. Keep this small —
 * every entry here is something a creator can say and observe happening on
 * the canvas without the model needing to negotiate multi-step plans.
 *
 * `run_generate` is the Claude-passthrough — the realtime model hands the
 * prompt to the existing agent loop rather than planning the generation
 * itself.
 */
export const VOICE_TOOL_DEFINITIONS: ReadonlyArray<VoiceToolDefinition> = [
  {
    name: 'focus_format',
    description:
      'Make a specific artboard / format the active focus target on the canvas.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Artboard (frame) id exactly as it appears on the canvas.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'pan_zoom',
    description: 'Pan or zoom the canvas camera. Zoom options: fit, in, out.',
    parameters: {
      type: 'object',
      properties: {
        artboardId: {
          type: 'string',
          description:
            'Optional artboard to zoom to. If omitted, applies to the whole canvas.',
        },
        zoom: {
          type: 'string',
          description: 'Zoom directive.',
          enum: ['fit', 'in', 'out'],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'remove_background',
    description:
      "Remove the background from the creator's currently-selected image. Dispatches the segmentation flow.",
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'run_capability',
    description:
      'Rerun a pinned capability by its definition id. Use this when the creator names a pinned skill.',
    parameters: {
      type: 'object',
      properties: {
        definitionId: {
          type: 'string',
          description: 'Pinned capability definition id to rerun.',
        },
      },
      required: ['definitionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_generate',
    description:
      'Hand a natural-language prompt off to the Claude planner + image provider. Use scope=all to fan out across every format, scope=single to only render the active one.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: "What the creator wants generated, in their own words.",
        },
        scope: {
          type: 'string',
          description: 'Fan-out scope. Defaults to single.',
          enum: ['single', 'all'],
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
] as const;

export const VOICE_TOOL_NAMES = VOICE_TOOL_DEFINITIONS.map((t) => t.name);
export type VoiceToolName = (typeof VOICE_TOOL_DEFINITIONS)[number]['name'];

/**
 * Every handler the toolbar / composer already exposes. The voice provider
 * doesn't invent new canvas state — it plugs into these. Keep this record
 * keyed by `VoiceToolName` so TypeScript catches drift if we extend the
 * realtime verb set.
 */
export interface VoiceDispatchers {
  focus_format: (args: { id: string }) => void | Promise<void>;
  pan_zoom: (args: {
    artboardId?: string;
    zoom?: 'fit' | 'in' | 'out';
  }) => void | Promise<void>;
  remove_background: () => void | Promise<void>;
  run_capability: (args: { definitionId: string }) => void | Promise<void>;
  run_generate: (args: {
    prompt: string;
    scope?: 'single' | 'all';
  }) => void | Promise<void>;
}

export type VoiceDispatchOutcome =
  | { ok: true; detail?: string }
  | { ok: false; error: string };

/**
 * Parse + dispatch a single function call. Returns a structured outcome so
 * the caller can feed it back to the realtime model via `sendFunctionResult`.
 * Unknown names or mis-shaped arguments fail closed — the model gets an
 * error payload instead of a silent no-op.
 */
export async function dispatchVoiceFunctionCall(
  name: string,
  args: Record<string, unknown>,
  dispatchers: VoiceDispatchers
): Promise<VoiceDispatchOutcome> {
  switch (name) {
    case 'focus_format': {
      const id = typeof args.id === 'string' ? args.id : '';
      if (!id) return { ok: false, error: 'focus_format requires a string id' };
      await dispatchers.focus_format({ id });
      return { ok: true, detail: `focused ${id}` };
    }
    case 'pan_zoom': {
      const artboardId =
        typeof args.artboardId === 'string' ? args.artboardId : undefined;
      const zoom =
        args.zoom === 'fit' || args.zoom === 'in' || args.zoom === 'out'
          ? args.zoom
          : undefined;
      await dispatchers.pan_zoom({ artboardId, zoom });
      return { ok: true };
    }
    case 'remove_background': {
      await dispatchers.remove_background();
      return { ok: true, detail: 'dispatched segmentation' };
    }
    case 'run_capability': {
      const definitionId =
        typeof args.definitionId === 'string' ? args.definitionId : '';
      if (!definitionId) {
        return { ok: false, error: 'run_capability requires a definitionId' };
      }
      await dispatchers.run_capability({ definitionId });
      return { ok: true, detail: `ran ${definitionId}` };
    }
    case 'run_generate': {
      const prompt = typeof args.prompt === 'string' ? args.prompt : '';
      if (!prompt) return { ok: false, error: 'run_generate requires a prompt' };
      const scope =
        args.scope === 'all' || args.scope === 'single' ? args.scope : undefined;
      await dispatchers.run_generate({ prompt, scope });
      return { ok: true, detail: `dispatched generate (${scope ?? 'single'})` };
    }
    default:
      return { ok: false, error: `unknown voice tool: ${name}` };
  }
}
