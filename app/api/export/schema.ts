import { z } from 'zod';

/**
 * Request contract for `POST /api/export`. The zod schema lives next to the
 * route per issue #16 so the wire shape stays obvious when the handler is
 * reviewed. The client bundles the artboards' latest PNGs (base64-encoded so
 * JSON stays valid) plus workspace-level metadata; the handler zips them
 * against `lib/export/manifest.ts`.
 */

export const exportArtboardInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aspectRatio: z.string().min(1),
  prompt: z.string(),
  capabilityRunIds: z.array(z.string()),
  provider: z.string().min(1),
  model: z.string(),
  /** Base64-encoded PNG bytes; `data:image/png;base64,` prefix is accepted. */
  pngBase64: z.string().min(1),
});

export const exportPinnedSkillInputSchema = z.object({
  definitionId: z.string().min(1),
  name: z.string().min(1),
});

export const exportBrandTokensInputSchema = z.object({
  palette: z.array(z.string()),
  typography: z.array(z.string()),
});

export const exportRequestSchema = z.object({
  workspaceId: z.string().min(1),
  artboardIds: z.array(z.string().min(1)).min(1),
  artboards: z.array(exportArtboardInputSchema).min(1),
  pinnedSkills: z.array(exportPinnedSkillInputSchema).default([]),
  brandTokens: exportBrandTokensInputSchema.default({ palette: [], typography: [] }),
});

export type ExportArtboardInputRaw = z.infer<typeof exportArtboardInputSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export { manifestSchema } from '@/lib/export/manifest';
