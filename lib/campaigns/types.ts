import type { SafeZonePresetId } from '@/lib/canvas/safeZones';

/**
 * Campaign picker — shared types.
 *
 * A creator picks a campaign shape on workspace open. The shape seeds the
 * Brief, declares which artboard formats the workspace opens with, and sets
 * the tone tokens the prompt composer hints on. Picks come either from a
 * curated template table (below) or a Claude-proposed shape produced from the
 * brand + offer + signals context.
 */

export type CampaignTemplateId =
  | 'launch'
  | 'drop'
  | 'evergreen'
  | 'announcement'
  | 'teaser'
  | 'recap';

export interface CampaignTemplate {
  id: CampaignTemplateId;
  /** 1-3 words; rendered as the card caption. */
  label: string;
  /** lucide icon name — resolved to a component at render time. */
  iconName: string;
  /** One-line strategic intent. Shown in the picker's hover/detail strip. */
  purpose: string;
  /** Artboard formats the workspace seeds when this template is picked. */
  defaultFormats: SafeZonePresetId[];
  /** Tone tokens the composer hints on. */
  suggestedTone: string[];
  /** First-draft Brief body seeded into the Brief textarea. */
  starterBrief: string;
}

export interface CampaignPick {
  /** Which template was picked. 'ai' means the picker generated it via Claude. */
  template: CampaignTemplateId | 'ai';
  /** One-line strategic intent the creator committed to. */
  intent: string;
  /** Formats the canvas opens with. */
  formats: SafeZonePresetId[];
  /** Tone tokens carried forward into the composer. */
  tone: string[];
  /** Brief body — seeded on pick, editable afterwards. */
  briefBody: string;
  /** When the pick was recorded. */
  pickedAt: number;
}

export interface CampaignProposal {
  /** 2-4 word name for the proposed campaign. */
  name: string;
  /** One-line strategic intent. */
  intent: string;
  /** Artboard formats the picker will seed. */
  formats: SafeZonePresetId[];
  /** Tone tokens. */
  tone: string[];
  /** First-draft Brief body. */
  briefBody: string;
}
