import { z } from 'zod';

/**
 * Zod schema for the `manifest.json` that ships at the root of every
 * exported pack. Pinned next to the route contract (see
 * `app/api/export/schema.ts`) and re-used by the server-side builder
 * (`lib/export/pack.ts`) to guarantee the file we write is the file we
 * promised — a single schema on both sides of the wire.
 */

export const pinnedSkillSchema = z.object({
  definitionId: z.string().min(1),
  name: z.string().min(1),
});

export const manifestFormatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aspectRatio: z.string().min(1),
  filename: z.string().min(1),
  capabilityRunIds: z.array(z.string()),
  prompt: z.string(),
  provider: z.string().min(1),
  model: z.string(),
});

export const brandTokensSchema = z.object({
  palette: z.array(z.string()),
  typography: z.array(z.string()),
});

export const manifestSchema = z.object({
  workspaceId: z.string().min(1),
  generatedAt: z.string().min(1),
  formats: z.array(manifestFormatSchema),
  pinnedSkills: z.array(pinnedSkillSchema),
  brandTokens: brandTokensSchema,
});

export type PinnedSkill = z.infer<typeof pinnedSkillSchema>;
export type ExportManifestFormat = z.infer<typeof manifestFormatSchema>;
export type BrandTokens = z.infer<typeof brandTokensSchema>;
export type ExportManifest = z.infer<typeof manifestSchema>;
