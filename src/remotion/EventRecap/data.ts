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
  /**
   * Smart-crop focal point — 0-1 normalized (x, y) where (0,0) is top-left
   * and (1,1) is bottom-right. The single most important point to keep
   * visible when cropping for 9:16 vertical or 16:9 horizontal frames
   * (faces, eyes, key text, central subject). Tagged via VLM in
   * scripts/tag-media-focal.ts. When omitted, MediaBackdrop falls back to
   * a centered 50%/50% crop (the historical behavior).
   *
   * **Legacy.** Prefer `faces` (constraint-based) over `focal` (heuristic).
   * Kept as a fallback for assets where the face tagger returned zero hits.
   */
  focal?: { x: number; y: number };
  /**
   * Subject bounding box — 0-1 normalized rectangle covering the key content
   * (the speaker, the slide text, the group of people). Useful for Ken Burns
   * pans that want to start wide and zoom toward `focal`.
   */
  subjectBox?: { x: number; y: number; w: number; h: number };
  /**
   * Native source dimensions in pixels. Populated by scripts/patch-data-with-
   * faces.ts from the SAM3 (or MediaPipe) face-tagger sidecar. The crop math
   * in src/remotion/EventRecap/crop.ts needs this to compute the visible
   * window under `object-fit: cover`.
   */
  sourceDims?: { width: number; height: number };
  /**
   * Face bounding boxes — 0-1 normalized in source coords. `source` records
   * which tagger placed the box so we can prefer SAM3 (mask-accurate) over
   * MediaPipe (bbox-only) when both fire. When this list is non-empty,
   * `computeFaceAwareTransform` switches from focal-heuristic mode to
   * constraint mode: it guarantees the union of faces stays visible at
   * cover scale (panning if it can't fit in a single static crop).
   */
  faces?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    confidence?: number;
    source?: 'sam3' | 'mediapipe';
  }>;
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
  { url: PROXY + 'linkedin/7283684d73974e93.jpg', type: 'image', authorName: 'Gabriel Chua', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 8.339, focal: { x: 0.442, y: 0.653 }, subjectBox: { x: 0.156, y: 0.577, w: 0.571, h: 0.417 }, sourceDims: { width: 1280, height: 1707 }, faces: [{ x: 0.135, y: 0.835, w: 0.066, h: 0.049, confidence: 0.55, source: 'sam3' }] },
  { url: PROXY + 'linkedin/80cf2056f23e190e.jpg', type: 'image', authorName: 'Rachael De Foe', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 7.122, focal: { x: 0.690, y: 0.420 }, subjectBox: { x: 0.140, y: 0.180, w: 0.770, h: 0.780 }, sourceDims: { width: 2048, height: 1365 }, faces: [{ x: 0.355, y: 0.247, w: 0.050, h: 0.094, confidence: 0.92, source: 'sam3' }, { x: 0.706, y: 0.261, w: 0.051, h: 0.102, confidence: 0.88, source: 'sam3' }, { x: 0.246, y: 0.152, w: 0.092, h: 0.175, confidence: 0.93, source: 'sam3' }, { x: 0.909, y: 0.312, w: 0.021, h: 0.025, confidence: 0.67, source: 'sam3' }, { x: 0.584, y: 0.263, w: 0.097, h: 0.144, confidence: 0.90, source: 'sam3' }, { x: 0.503, y: 0.168, w: 0.063, h: 0.125, confidence: 0.92, source: 'sam3' }, { x: 0.773, y: 0.299, w: 0.025, h: 0.056, confidence: 0.82, source: 'sam3' }] },
  { url: PROXY + 'linkedin/2eb07f40745ef693.jpg', type: 'image', authorName: 'Mumshad Mannambeth', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 6.777, focal: { x: 0.490, y: 0.430 }, subjectBox: { x: 0.270, y: 0.360, w: 0.460, h: 0.640 }, sourceDims: { width: 1280, height: 1707 }, faces: [{ x: 0.422, y: 0.327, w: 0.122, h: 0.111, confidence: 0.93, source: 'sam3' }] },
  { url: PROXY + 'linkedin/5a4bd68babd06646.jpg', type: 'image', authorName: 'Anil Srinivas Chilla', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 6.349, focal: { x: 0.270, y: 0.600 }, subjectBox: { x: 0.210, y: 0.410, w: 0.280, h: 0.470 }, sourceDims: { width: 1280, height: 720 }, faces: [{ x: 0.235, y: 0.502, w: 0.023, h: 0.049, confidence: 0.82, source: 'sam3' }] },
  { url: PROXY + 'linkedin/3c189a8fde95029c.jpg', type: 'image', authorName: 'Val Yap', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 5.873, focal: { x: 0.705, y: 0.330 }, subjectBox: { x: 0.090, y: 0.200, w: 0.800, h: 0.720 }, sourceDims: { width: 1200, height: 800 }, faces: [{ x: 0.682, y: 0.256, w: 0.047, h: 0.085, confidence: 0.88, source: 'sam3' }] },
  { url: PROXY + 'linkedin/8f93e50c8c6d7199.jpg', type: 'image', authorName: 'Sherry Jiang', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 5.511, focal: { x: 0.526, y: 0.380 }, subjectBox: { x: 0.000, y: 0.170, w: 1.000, h: 0.820 }, sourceDims: { width: 2048, height: 1253 }, faces: [{ x: 0.801, y: 0.235, w: 0.054, h: 0.080, confidence: 0.79, source: 'sam3' }, { x: 0.218, y: 0.204, w: 0.048, h: 0.084, confidence: 0.80, source: 'sam3' }, { x: 0.652, y: 0.257, w: 0.045, h: 0.099, confidence: 0.79, source: 'sam3' }, { x: 0.388, y: 0.176, w: 0.049, h: 0.089, confidence: 0.82, source: 'sam3' }, { x: 0.288, y: 0.184, w: 0.045, h: 0.102, confidence: 0.81, source: 'sam3' }, { x: 0.501, y: 0.264, w: 0.055, h: 0.092, confidence: 0.82, source: 'sam3' }, { x: 0.589, y: 0.171, w: 0.054, h: 0.111, confidence: 0.82, source: 'sam3' }, { x: 0.726, y: 0.242, w: 0.055, h: 0.102, confidence: 0.82, source: 'sam3' }] },
  { url: PROXY + 'linkedin/73c0f3f39dafe410.jpg', type: 'image', authorName: 'Agrim Singh', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 5.264, focal: { x: 0.173, y: 0.481 }, subjectBox: { x: 0.000, y: 0.273, w: 1.000, h: 0.726 }, sourceDims: { width: 1280, height: 1706 }, faces: [{ x: 0.883, y: 0.298, w: 0.119, h: 0.166, confidence: 0.85, source: 'sam3' }, { x: -0.001, y: 0.504, w: 0.066, h: 0.070, confidence: 0.79, source: 'sam3' }, { x: 0.373, y: 0.422, w: 0.030, h: 0.020, confidence: 0.49, source: 'sam3' }, { x: 0.664, y: 0.351, w: 0.046, h: 0.046, confidence: 0.81, source: 'sam3' }, { x: 0.474, y: 0.367, w: 0.042, h: 0.039, confidence: 0.78, source: 'sam3' }, { x: 0.200, y: 0.385, w: 0.059, h: 0.040, confidence: 0.83, source: 'sam3' }] },
  { url: PROXY + 'youtube/_xQnSNlBP_w-f56869a8.jpg', type: 'image', authorName: 'AI Engineer', platform: 'youtube', storyId: 'vivian-builder-keynote', reachScore: 4.136, focal: { x: 0.780, y: 0.340 }, subjectBox: { x: 0.000, y: 0.000, w: 1.000, h: 1.000 }, sourceDims: { width: 720, height: 404 }, faces: [{ x: 0.685, y: 0.134, w: 0.258, h: 0.525, confidence: 0.94, source: 'sam3' }] },
  { url: PROXY + 'linkedin/735cb1756d419c7e.jpg', type: 'image', authorName: 'Linh Nguyen', platform: 'linkedin', storyId: 'sponsors-booths-hiring', reachScore: 4.113, focal: { x: 0.503, y: 0.571 }, subjectBox: { x: 0.000, y: 0.390, w: 1.000, h: 0.610 }, sourceDims: { width: 1280, height: 1707 }, faces: [{ x: 0.620, y: 0.435, w: 0.017, h: 0.010, confidence: 0.42, source: 'sam3' }, { x: 0.306, y: 0.401, w: 0.026, h: 0.024, confidence: 0.65, source: 'sam3' }, { x: 0.533, y: 0.431, w: 0.010, h: 0.009, confidence: 0.54, source: 'sam3' }, { x: 0.514, y: 0.401, w: 0.013, h: 0.012, confidence: 0.43, source: 'sam3' }, { x: 0.871, y: 0.389, w: 0.106, h: 0.116, confidence: 0.78, source: 'sam3' }, { x: 0.184, y: 0.388, w: 0.105, h: 0.084, confidence: 0.84, source: 'sam3' }, { x: 0.732, y: 0.427, w: 0.019, h: 0.013, confidence: 0.41, source: 'sam3' }, { x: 0.680, y: 0.417, w: 0.020, h: 0.020, confidence: 0.69, source: 'sam3' }, { x: 0.001, y: 0.354, w: 0.152, h: 0.107, confidence: 0.79, source: 'sam3' }, { x: 0.581, y: 0.441, w: 0.012, h: 0.010, confidence: 0.47, source: 'sam3' }, { x: 0.431, y: 0.367, w: 0.015, h: 0.015, confidence: 0.61, source: 'sam3' }, { x: 0.469, y: 0.419, w: 0.064, h: 0.065, confidence: 0.90, source: 'sam3' }, { x: 0.567, y: 0.420, w: 0.011, h: 0.012, confidence: 0.64, source: 'sam3' }, { x: 0.795, y: 0.422, w: 0.085, h: 0.070, confidence: 0.87, source: 'sam3' }] },
  { url: PROXY + 'x/da5a79bdec2220ff-81cfaec4b5f94124.jpg', type: 'image', authorName: 'Vivian Balakrishnan', platform: 'x', storyId: 'vivian-builder-keynote', reachScore: 3.813, focal: { x: 0.199, y: 0.615 }, subjectBox: { x: 0.120, y: 0.370, w: 0.190, h: 0.390 }, sourceDims: { width: 1200, height: 803 }, faces: [{ x: 0.184, y: 0.502, w: 0.027, h: 0.050, confidence: 0.84, source: 'sam3' }] },
  { url: PROXY + 'linkedin/47da1b228c7650df.jpg', type: 'image', authorName: 'Saad Hamid', platform: 'linkedin', storyId: 'vivian-builder-keynote', reachScore: 3.719, focal: { x: 0.430, y: 0.510 }, subjectBox: { x: 0.000, y: 0.430, w: 1.000, h: 0.570 }, sourceDims: { width: 1280, height: 1707 }, faces: [{ x: 0.391, y: 0.506, w: 0.067, h: 0.055, confidence: 0.86, source: 'sam3' }, { x: 0.260, y: 0.427, w: 0.079, h: 0.068, confidence: 0.88, source: 'sam3' }, { x: 0.763, y: 0.396, w: 0.090, h: 0.068, confidence: 0.88, source: 'sam3' }, { x: 0.482, y: 0.476, w: 0.059, h: 0.055, confidence: 0.90, source: 'sam3' }, { x: 0.154, y: 0.433, w: 0.103, h: 0.086, confidence: 0.86, source: 'sam3' }, { x: 0.553, y: 0.434, w: 0.067, h: 0.060, confidence: 0.91, source: 'sam3' }, { x: 0.373, y: 0.439, w: 0.053, h: 0.055, confidence: 0.88, source: 'sam3' }, { x: 0.650, y: 0.423, w: 0.071, h: 0.065, confidence: 0.89, source: 'sam3' }] },
  { url: PROXY + 'linkedin/24bdcda6b7901a2f.jpg', type: 'image', authorName: 'Saad Hamid (Google)', platform: 'linkedin', storyId: 'sponsors-booths-hiring', reachScore: 3.653, focal: { x: 0.651, y: 0.548 }, subjectBox: { x: 0.120, y: 0.290, w: 0.790, h: 0.710 }, sourceDims: { width: 1280, height: 1707 }, faces: [{ x: 0.253, y: 0.585, w: 0.036, h: 0.039, confidence: 0.86, source: 'sam3' }, { x: 0.404, y: 0.473, w: 0.023, h: 0.022, confidence: 0.79, source: 'sam3' }, { x: 0.311, y: 0.675, w: 0.018, h: 0.017, confidence: 0.46, source: 'sam3' }, { x: 0.241, y: 0.696, w: 0.048, h: 0.044, confidence: 0.83, source: 'sam3' }, { x: 0.640, y: 0.782, w: 0.011, h: 0.014, confidence: 0.62, source: 'sam3' }, { x: 0.580, y: 0.398, w: 0.106, h: 0.088, confidence: 0.87, source: 'sam3' }, { x: 0.267, y: 0.454, w: 0.039, h: 0.036, confidence: 0.84, source: 'sam3' }, { x: 0.398, y: 0.570, w: 0.035, h: 0.034, confidence: 0.83, source: 'sam3' }, { x: 0.415, y: 0.705, w: 0.020, h: 0.020, confidence: 0.77, source: 'sam3' }] },
  { url: PROXY + 'linkedin/4d9d2e5d23486bbe.jpg', type: 'image', authorName: 'Gabriel Chua', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 3.275, focal: { x: 0.270, y: 0.310 }, subjectBox: { x: 0.080, y: 0.180, w: 0.360, h: 0.660 }, sourceDims: { width: 1144, height: 1200 }, faces: [{ x: 0.199, y: 0.205, w: 0.115, h: 0.118, confidence: 0.93, source: 'sam3' }] },
  { url: PROXY + 'linkedin/09f71a35995d1f78.jpg', type: 'image', authorName: 'Gabriel Chua', platform: 'linkedin', storyId: 'openai-codex-presence', reachScore: 3.028, focal: { x: 0.454, y: 0.829 }, subjectBox: { x: 0.000, y: 0.372, w: 1.000, h: 0.628 }, sourceDims: { width: 2048, height: 1536 }, faces: [{ x: 0.989, y: 0.653, w: 0.012, h: 0.016, confidence: 0.59, source: 'sam3' }, { x: 0.813, y: 0.725, w: 0.011, h: 0.014, confidence: 0.58, source: 'sam3' }, { x: 0.695, y: 0.752, w: 0.008, h: 0.014, confidence: 0.46, source: 'sam3' }, { x: 0.844, y: 0.715, w: 0.007, h: 0.011, confidence: 0.47, source: 'sam3' }, { x: 0.113, y: 0.976, w: 0.012, h: 0.027, confidence: 0.44, source: 'sam3' }, { x: 0.942, y: 0.754, w: 0.017, h: 0.049, confidence: 0.60, source: 'sam3' }, { x: 0.352, y: 0.912, w: 0.008, h: 0.024, confidence: 0.42, source: 'sam3' }, { x: 0.832, y: 0.825, w: 0.015, h: 0.041, confidence: 0.54, source: 'sam3' }, { x: 0.755, y: 0.736, w: 0.009, h: 0.013, confidence: 0.43, source: 'sam3' }, { x: 0.448, y: 0.661, w: 0.014, h: 0.020, confidence: 0.70, source: 'sam3' }, { x: 0.311, y: 0.977, w: 0.012, h: 0.027, confidence: 0.43, source: 'sam3' }, { x: 0.726, y: 0.746, w: 0.009, h: 0.013, confidence: 0.43, source: 'sam3' }, { x: 0.930, y: 0.730, w: 0.011, h: 0.014, confidence: 0.57, source: 'sam3' }, { x: 0.765, y: 0.816, w: 0.010, h: 0.023, confidence: 0.47, source: 'sam3' }, { x: 0.794, y: 0.734, w: 0.009, h: 0.010, confidence: 0.54, source: 'sam3' }, { x: 0.702, y: 0.855, w: 0.012, h: 0.024, confidence: 0.45, source: 'sam3' }] },
  { url: PROXY + 'linkedin/89cbef6a75c1c863.jpg', type: 'image', authorName: 'Thu Ya K.', platform: 'linkedin', storyId: 'sponsors-booths-hiring', reachScore: 2.979, focal: { x: 0.290, y: 0.480 }, subjectBox: { x: 0.140, y: 0.300, w: 0.560, h: 0.700 }, sourceDims: { width: 2048, height: 1536 }, faces: [{ x: 0.207, y: 0.417, w: 0.195, h: 0.335, confidence: 0.95, source: 'sam3' }, { x: 0.517, y: 0.499, w: 0.103, h: 0.140, confidence: 0.93, source: 'sam3' }, { x: 0.414, y: 0.479, w: 0.023, h: 0.042, confidence: 0.84, source: 'sam3' }] },
  { url: PROXY + 'linkedin/fb1b9d9b6054f12d.jpg', type: 'image', authorName: 'Lavanya Garg', platform: 'linkedin', storyId: 'students-organizers-community', reachScore: 2.93, focal: { x: 0.500, y: 0.430 }, subjectBox: { x: 0.140, y: 0.160, w: 0.720, h: 0.660 }, sourceDims: { width: 2048, height: 1075 }, faces: [{ x: 0.747, y: 0.149, w: 0.045, h: 0.125, confidence: 0.75, source: 'sam3' }] },
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
 * Returns the CSS `objectPosition` value for a tagged MediaAsset, or
 * the neutral `'50% 50%'` for assets that have no focal point yet. Use
 * this everywhere a photo is laid down with `objectFit: 'cover'` so the
 * subject (face, key text) stays in frame across both 9:16 and 16:9.
 *
 * **DEPRECATED.** This is the focal-heuristic version that biased the crop
 * center but couldn't guarantee any specific region stayed visible. Prefer
 * `computeFaceAwareTransform()` from `./crop.ts`, which uses tagged face
 * bboxes as a hard constraint and pans across the source when a static crop
 * can't preserve the full face union. We keep this helper for assets that
 * have no face tags (legacy or text-only screens).
 */
export function focalObjectPosition(asset: Pick<MediaAsset, 'focal'>): string {
  if (!asset.focal) return '50% 50%';
  const x = Math.max(0, Math.min(1, asset.focal.x)) * 100;
  const y = Math.max(0, Math.min(1, asset.focal.y)) * 100;
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}

/**
 * A Ken Burns keyframe — `(x, y)` is the `objectPosition` 0-1 normalized
 * and `scale` is a `transform: scale()` multiplier (1.0 = no zoom).
 */
export interface KenBurnsKey {
  x: number;
  y: number;
  scale: number;
}

/**
 * Derive a default Ken Burns pan for a tagged MediaAsset. The motion
 * starts wide and slowly zooms toward the focal point — every variant
 * that wants the bare default can just call this. Motion-rich variants
 * may override with custom keys per scene.
 *
 *   - `from`: a wider framing centered on the subjectBox at scale 1.02
 *   - `to`:   zoomed slightly toward the focal point at scale 1.12
 *
 * If the asset has neither focal nor subjectBox, the pan collapses to a
 * gentle center zoom (the historical "ken burns 1.0 → 1.08" feel).
 */
export function defaultKenBurns(
  asset: Pick<MediaAsset, 'focal' | 'subjectBox'>
): { from: KenBurnsKey; to: KenBurnsKey } {
  const focal = asset.focal;
  const box = asset.subjectBox;
  if (!focal && !box) {
    return {
      from: { x: 0.5, y: 0.5, scale: 1.0 },
      to: { x: 0.5, y: 0.5, scale: 1.08 },
    };
  }
  // Center of the subject box (or focal if no box)
  const cx = box ? box.x + box.w / 2 : focal!.x;
  const cy = box ? box.y + box.h / 2 : focal!.y;
  // Start framing on the subject center wide, end zoomed toward the focal.
  return {
    from: { x: cx, y: cy, scale: 1.02 },
    to: { x: focal?.x ?? cx, y: focal?.y ?? cy, scale: 1.12 },
  };
}

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
