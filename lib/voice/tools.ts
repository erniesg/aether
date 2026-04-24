import {
  normalizeVoiceBrushColor,
  normalizeVoiceBrushSize,
  normalizeVoiceBrushSizeDelta,
  normalizeVoiceSelectableTool,
  type PrimitiveTool,
  type SketchBrushColor,
  type SketchBrushSize,
  type VoiceBrushSizeDelta,
  VOICE_BRUSH_COLORS,
  VOICE_BRUSH_SIZES,
  VOICE_SELECTABLE_TOOLS,
} from '@/lib/canvas/sketchBrush';
import type { VoiceToolDefinition } from './types';

/**
 * The safe verb set the realtime model can call today. Keep this small —
 * every entry here is something a creator can say and observe happening on
 * the canvas without the model needing to negotiate multi-step plans.
 *
 * `run_generate` is still the Claude-passthrough — the realtime model hands
 * the prompt to the existing agent loop rather than planning the generation
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
    name: 'select_tool',
    description:
      'Switch the canvas tool. Use draw for sketching, select to return to selection, or hand to pan.',
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Canvas tool to activate. sketch is an alias for draw.',
          enum: [...VOICE_SELECTABLE_TOOLS],
        },
      },
      required: ['tool'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_brush_color',
    description:
      'Set the sketch brush color from the bounded creator palette.',
    parameters: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description: 'Named brush color from the mapped palette.',
          enum: [...VOICE_BRUSH_COLORS],
        },
      },
      required: ['color'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_brush_size',
    description:
      'Set the sketch brush size. Use this before drawing the next stroke.',
    parameters: {
      type: 'object',
      properties: {
        size: {
          type: 'string',
          description: 'Brush thickness preset.',
          enum: [...VOICE_BRUSH_SIZES],
        },
      },
      required: ['size'],
      additionalProperties: false,
    },
  },
  {
    name: 'adjust_brush_size',
    description:
      'Make the sketch brush relatively thicker or thinner from its current preset.',
    parameters: {
      type: 'object',
      properties: {
        delta: {
          type: 'string',
          description: 'Relative brush thickness change.',
          enum: ['thicker', 'thinner'],
        },
      },
      required: ['delta'],
      additionalProperties: false,
    },
  },
  {
    name: 'clear_sketch',
    description:
      'Delete the current sketch strokes from the active sketch session.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'confirm_sketch',
    description:
      'Finish the current sketch session and switch back to the select tool.',
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
  select_tool: (args: {
    tool: Extract<PrimitiveTool, 'select' | 'hand' | 'draw'>;
  }) => void | Promise<void>;
  set_brush_color: (args: { color: SketchBrushColor }) => void | Promise<void>;
  set_brush_size: (args: { size: SketchBrushSize }) => void | Promise<void>;
  adjust_brush_size: (args: {
    delta: VoiceBrushSizeDelta;
  }) => void | Promise<void>;
  clear_sketch: () => void | Promise<void>;
  confirm_sketch: () => void | Promise<void>;
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
    case 'select_tool': {
      const tool = normalizeVoiceSelectableTool(args.tool);
      if (!tool || (tool !== 'select' && tool !== 'hand' && tool !== 'draw')) {
        return { ok: false, error: 'select_tool requires select, hand, draw, or sketch' };
      }
      await dispatchers.select_tool({ tool });
      return { ok: true, detail: `selected ${tool}` };
    }
    case 'set_brush_color': {
      const color = normalizeVoiceBrushColor(args.color);
      if (!color) {
        return { ok: false, error: 'set_brush_color requires a bounded palette color' };
      }
      await dispatchers.set_brush_color({ color });
      return { ok: true, detail: `brush color ${color}` };
    }
    case 'set_brush_size': {
      const size = normalizeVoiceBrushSize(args.size);
      if (!size) {
        return { ok: false, error: 'set_brush_size requires small, medium, or large' };
      }
      await dispatchers.set_brush_size({ size });
      return { ok: true, detail: `brush size ${size}` };
    }
    case 'adjust_brush_size': {
      const delta = normalizeVoiceBrushSizeDelta(args.delta);
      if (!delta) {
        return { ok: false, error: 'adjust_brush_size requires thicker or thinner' };
      }
      await dispatchers.adjust_brush_size({ delta });
      return { ok: true, detail: `brush ${delta}` };
    }
    case 'clear_sketch': {
      await dispatchers.clear_sketch();
      return { ok: true, detail: 'cleared sketch' };
    }
    case 'confirm_sketch': {
      await dispatchers.confirm_sketch();
      return { ok: true, detail: 'confirmed sketch' };
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
