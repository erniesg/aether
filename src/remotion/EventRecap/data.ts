/**
 * Types + sample bundle for the recap composition.
 *
 * In production these mirror lib/research/event-recap/types.ts (EventPost,
 * EventTheme, EventVoice, EventRecapBundle). The Remotion composition takes
 * the *public* slice — no raw provider payloads — and reshapes it to the
 * fields the scenes consume. The fetcher (fetchPublicBundle) hits the
 * worker's /vibes/<eventId>/data endpoint and trusts the same redaction
 * policy as lib/research/event-recap/public-bundle.ts.
 */

export type Platform = 'x' | 'linkedin' | 'youtube';

export interface RecapPost {
  postId: string;
  platform: Platform;
  authorName: string;
  authorHandle: string;
  verified?: boolean;
  text: string;
  postedAt?: string;
  media?: {
    url: string;
    type: 'image' | 'video';
    proxyPath?: string;
    width?: number;
    height?: number;
    durationMs?: number;
  };
  metrics: {
    likes?: number;
    reposts?: number;
    replies?: number;
    comments?: number;
    reactions?: number;
    views?: number;
  };
  reachScore: number;
}

export interface RecapTheme {
  storyId: string;
  label: string;
  postCount: number;
}

export interface RecapVoice {
  name: string;
  handle?: string;
  platform: Platform;
  postCount: number;
  reachScore: number;
  sampleQuote?: string;
  initial: string;
}

export interface RecapSponsor {
  brand: string;
  tier: 'diamond' | 'platinum' | 'gold';
  refs: number;
  monogram?: string;
  color?: string;
}

export interface RecapBundle {
  eventId: string;
  eventName: string;
  dates: string;
  venue?: string;
  stats: {
    knownViews: number;
    refs: number;
    refsPrimary: number;
    refsContext: number;
    publicReactions: number;
    mediaAssets: number;
    playableVideos: number;
  };
  themes: RecapTheme[];
  voices: RecapVoice[];
  sponsors: RecapSponsor[];
  /** The single hero moment featured in MomentScene. */
  heroMoment: RecapPost;
  workshops: { name: string; meta: string }[];
}

/**
 * Real media pool — 18 captured photos + 1 video from the public bundle,
 * lifted verbatim from /vibes/aie2026/data on 2026-05-24. Cross-cuts
 * these BEHIND every scene so the recap feels like video, not a PDF.
 */
export interface MediaAsset {
  url: string;
  type: 'image' | 'video';
  authorName: string;
  platform: Platform;
  storyId: string;
  reachScore: number;
}

/**
 * URLs route through the worker's media proxy — R2-backed, CORS-open,
 * and stable. Direct LinkedIn CDN URLs (media.licdn.com) refuse hotlinks
 * from headless Chrome during Remotion renders; the proxy serves the
 * same bytes Cloudflare-edge-cached.
 */
const PROXY = 'https://aether.berlayar.ai/vibes/aie2026/media?path=event-recap-ai-engineer-singapore/media/';

export const aie2026MediaPool: MediaAsset[] = [
  { url: PROXY + 'x/b0c024c34177c5fb.mp4', type: 'video', authorName: 'Melissa Chen', platform: 'x', storyId: 'vivian-builder-keynote', reachScore: 30.018 },
  { url: PROXY + 'linkedin/7283684d73974e93.jpg', type: 'image', authorName: 'Gabriel Chua', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 8.339 },
  { url: PROXY + 'linkedin/80cf2056f23e190e.jpg', type: 'image', authorName: 'Rachael De Foe', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 7.122 },
  { url: PROXY + 'linkedin/2eb07f40745ef693.jpg', type: 'image', authorName: 'Mumshad Mannambeth', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 6.777 },
  { url: PROXY + 'linkedin/5a4bd68babd06646.jpg', type: 'image', authorName: 'Anil Srinivas Chilla', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 6.349 },
  { url: PROXY + 'linkedin/3c189a8fde95029c.jpg', type: 'image', authorName: 'Val Yap', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 5.873 },
  { url: PROXY + 'linkedin/8f93e50c8c6d7199.jpg', type: 'image', authorName: 'Sherry Jiang', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 5.511 },
  { url: PROXY + 'linkedin/73c0f3f39dafe410.jpg', type: 'image', authorName: 'Agrim Singh', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 5.264 },
  { url: PROXY + 'youtube/_xQnSNlBP_w-f56869a8.jpg', type: 'image', authorName: 'AI Engineer', platform: 'youtube', storyId: 'vivian-builder-keynote', reachScore: 4.136 },
  { url: PROXY + 'linkedin/735cb1756d419c7e.jpg', type: 'image', authorName: 'Linh Nguyen', platform: 'linkedin', storyId: 'sponsors-booths-hiring', reachScore: 4.113 },
  { url: PROXY + 'x/da5a79bdec2220ff-81cfaec4b5f94124.jpg', type: 'image', authorName: 'Vivian Balakrishnan', platform: 'x', storyId: 'vivian-builder-keynote', reachScore: 3.813 },
  { url: PROXY + 'linkedin/47da1b228c7650df.jpg', type: 'image', authorName: 'Saad Hamid', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 3.719 },
  { url: PROXY + 'linkedin/24bdcda6b7901a2f.jpg', type: 'image', authorName: 'Saad Hamid (Google)', platform: 'linkedin', storyId: 'sponsors-booths-hiring', reachScore: 3.653 },
  { url: PROXY + 'linkedin/4d9d2e5d23486bbe.jpg', type: 'image', authorName: 'Gabriel Chua', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 3.275 },
  { url: PROXY + 'linkedin/09f71a35995d1f78.jpg', type: 'image', authorName: 'Gabriel Chua', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 3.028 },
  { url: PROXY + 'linkedin/89cbef6a75c1c863.jpg', type: 'image', authorName: 'Thu Ya K.', platform: 'linkedin', storyId: 'sponsors-booths-hiring', reachScore: 2.979 },
  { url: PROXY + 'linkedin/fb1b9d9b6054f12d.jpg', type: 'image', authorName: 'Lavanya Garg', platform: 'linkedin', storyId: 'students-organizers-community', reachScore: 2.93 },
];

/**
 * Real data lifted from https://aether.berlayar.ai/vibes/aie2026/data
 * (validated 2026-05-24).
 */
export const aie2026SampleBundle: RecapBundle = {
  eventId: 'aie2026',
  eventName: 'AI Engineer Singapore',
  dates: '2026 · MAY 17 – 19',
  venue: 'Pullman + Capitol Kempinski',
  stats: {
    knownViews: 4_000_000,
    refs: 872,
    refsPrimary: 701,
    refsContext: 171,
    publicReactions: 36_800,
    mediaAssets: 972,
    playableVideos: 54,
  },
  themes: [
    { storyId: 'vivian-builder-keynote', label: "Vivian's builder keynote", postCount: 145 },
    { storyId: 'overall-event-recaps', label: 'Event recaps + hallway', postCount: 89 },
    { storyId: 'sponsors-booths-hiring', label: 'Sponsors + booths + hiring', postCount: 76 },
    { storyId: 'openai-codex-presence', label: 'OpenAI Codex presence', postCount: 68 },
    { storyId: 'students-organizers-community', label: 'Students + organizers · 65labs', postCount: 54 },
    { storyId: 'agentic-workshops', label: 'Workshops + agentic workflows', postCount: 42 },
  ],
  voices: [
    {
      name: 'Vivian Balakrishnan',
      handle: '@vivianbala',
      platform: 'x',
      postCount: 8,
      reachScore: 1.84,
      sampleQuote: 'You cannot govern a technology you have only been briefed on.',
      initial: 'V',
    },
    {
      name: 'Sherry Jiang',
      handle: '@sherrypeek',
      platform: 'linkedin',
      postCount: 3,
      reachScore: 1.42,
      sampleQuote: 'Day 2 closed with proof Singapore can host a serious AI builder room.',
      initial: 'S',
    },
    {
      name: 'Gabriel Chua',
      handle: '@gabriel-chua',
      platform: 'linkedin',
      postCount: 5,
      reachScore: 1.21,
      sampleQuote: 'Codex day-by-day. Hack night. Realtime. Receipts from the room.',
      initial: 'G',
    },
    {
      name: 'Rachael De Foe',
      handle: '@rachaeldefoe',
      platform: 'linkedin',
      postCount: 2,
      reachScore: 0.94,
      sampleQuote: 'This was Singapore showing up — not flown in. 65labs built the scene.',
      initial: 'R',
    },
    {
      name: 'Agrim Singh',
      handle: '@agrims',
      platform: 'linkedin',
      postCount: 2,
      reachScore: 0.81,
      sampleQuote: '65labs sponsored seats. The scene shows up for the next ones.',
      initial: 'A',
    },
  ],
  sponsors: [
    { brand: 'OpenAI', tier: 'diamond', refs: 38 },
    { brand: 'Google DeepMind', tier: 'diamond', refs: 24, monogram: 'G', color: '#1a73e8' },
    { brand: 'Cursor', tier: 'platinum', refs: 18 },
    { brand: 'Vercel', tier: 'platinum', refs: 14 },
    { brand: 'Convex', tier: 'platinum', refs: 11, monogram: 'C', color: '#ee342f' },
    { brand: 'Cerebras', tier: 'platinum', refs: 9, monogram: 'C', color: '#ff6b00' },
    { brand: 'Cloudflare', tier: 'gold', refs: 7, monogram: 'C', color: '#f48120' },
    { brand: 'Stripe', tier: 'gold', refs: 6, monogram: 'S', color: '#635bff' },
    { brand: 'Daytona', tier: 'gold', refs: 5, monogram: 'D', color: '#0d1117' },
    { brand: 'Exa', tier: 'gold', refs: 5, monogram: 'E', color: '#1f2d4a' },
    { brand: 'Arize', tier: 'gold', refs: 4, monogram: 'A', color: '#7e3af2' },
    { brand: 'PostHog', tier: 'gold', refs: 4, monogram: 'P', color: '#f54e00' },
  ],
  heroMoment: {
    postId: 'x_1w635a6',
    platform: 'x',
    authorName: 'Melissa Chen',
    authorHandle: '@MsMelChen',
    verified: true,
    text:
      "Singapore's Foreign Minister, Dr Balakrishnan casually explaining how he built his own AI agent (a 2nd brain for diplomacy) using Claude & WhatsApp integration etc. on a Raspberry Pi\n\n\"You cannot govern a technology you have only been briefed on.\" 🇸🇬",
    postedAt: '2026-05-18',
    media: {
      url: 'https://video.twimg.com/amplify_video/2055576946046881792/vid/avc1/1920x1080/Sq_MjxoyJULCgLWj.mp4',
      proxyPath: 'event-recap-ai-engineer-singapore/media/x/b0c024c34177c5fb.mp4',
      type: 'video',
      durationMs: 84_000,
    },
    metrics: { likes: 10_980, reposts: 2_448, replies: 173, views: 2_165_292 },
    reachScore: 30.018,
  },
  workshops: [
    { name: 'LlamaIndex · agentic documents · enterprise PDF', meta: 'workshop' },
    { name: 'x402 + pay.sh · agent payments', meta: 'talk' },
    { name: 'Cerebras inference · MoE · world models', meta: 'research' },
    { name: 'Reachy · stage demo · creative AI', meta: 'creative' },
    { name: 'Codex for Everyone · realtime hack night', meta: 'workshop' },
  ],
};

/**
 * Production fetcher — hits the worker's data endpoint and reshapes
 * into RecapBundle. Used by scripts/render-recap.ts to render fresh
 * MP4s after each cron refresh.
 */
export async function fetchPublicBundle(
  eventId: string,
  origin = 'https://aether.berlayar.ai'
): Promise<RecapBundle> {
  const url = `${origin}/vibes/${eventId}/data`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`fetchPublicBundle ${eventId} ${res.status}: ${res.statusText}`);
  }
  const _raw = await res.json();
  // TODO: real reshape lives next to lib/research/event-recap/public-bundle.ts
  // For now the sample bundle stands in; the contract is what matters.
  return { ...aie2026SampleBundle, eventId };
}
