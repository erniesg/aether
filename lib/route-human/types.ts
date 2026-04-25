// Shared types for the route-human (Discord review) module.

export type ReviewArtifactKind = 'screenshot' | 'screencap' | 'generation-sample' | 'log';

export type ReviewArtifact = {
  kind: ReviewArtifactKind;
  url: string;
  caption: string;
};

export type ReviewChecklistItem = {
  item: string;
  passed: boolean;
};

export type ReviewTestSummary = {
  total: number;
  passed: number;
  failed: number;
  coverage?: number;
};

export type ReviewerVerdict = 'APPROVE';

export type ReviewNotification = {
  kind: 'ready-for-ernie';
  issueNumber: number;
  issueTitle: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  author: 'claude' | string;
  acceptanceChecklist: ReviewChecklistItem[];
  reviewerVerdict: ReviewerVerdict;
  reviewerSummary: string;
  artifacts: ReviewArtifact[];
  testSummary: ReviewTestSummary;
};

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbedImage = {
  url: string;
};

export type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedImage;
  footer?: { text: string };
  timestamp?: string;
};

export type DiscordButtonStyle = 1 | 2 | 3 | 4 | 5;

export type DiscordButtonComponent = {
  type: 2;
  style: DiscordButtonStyle;
  label: string;
  custom_id: string;
  emoji?: { name: string };
};

export type DiscordActionRow = {
  type: 1;
  components: DiscordButtonComponent[];
};

export type DiscordWebhookBody = {
  content?: string;
  username?: string;
  embeds: DiscordEmbed[];
  components?: DiscordActionRow[];
  allowed_mentions?: { parse: Array<'users' | 'roles' | 'everyone'> };
};

export const DISCORD_COLOR = {
  APPROVE: 0x0e8a16,
  REQUEST_CHANGES: 0xd93f0b,
  BLOCK: 0x5c0000,
  PAUSED: 0xfbca04,
} as const;

// Prefixes for interaction button custom_ids. Kept short — Discord caps
// custom_id at 100 chars, so `<prefix>_<prNumber>` stays well inside.
export const BUTTON_PREFIX = {
  MERGE: 'merge',
  REQUEST_CHANGES: 'request_changes',
  PAUSE: 'pause',
  BLOCK: 'block',
  HUMAN_CHOICE: 'human_choice',
} as const;

export const MODAL_PREFIX = {
  REQUEST_CHANGES: 'request_changes_modal',
} as const;
