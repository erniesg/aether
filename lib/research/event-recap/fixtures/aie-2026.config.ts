import type { EventConfig, PrimaryStoryOverride, StoryDefinitionConfig } from '../event-config';

/**
 * AIE Singapore 2026 event configuration.
 *
 * Source of truth for the recap that ships at aether.berlayar.ai/vibes/aie2026.
 * Subsequent slices populate corpusPhraseRules, curatedThemeCopy, and atlasLanes.
 */

const stories: StoryDefinitionConfig[] = [
  {
    storyId: 'vivian-builder-keynote',
    label: "Vivian Balakrishnan's builder keynote",
    summary:
      'Foreign Minister Vivian Balakrishnan was the dominant travelled story: Raspberry Pi, NanoClaw, WhatsApp, second-brain workflows, and the line about not governing technology you have only been briefed on.',
    keywords: ['vivian balakrishnan', 'nanoclaw', 'raspberry pi', 'second brain', 'briefed on'],
    signals: [
      { pattern: /\b(vivian|vivianbala|balakrishnan|foreign minister|minister for foreign affairs|cabinet minister)\b/i, weight: 4 },
      { pattern: /\b(nanoclaw|nano claw|raspberry pi|raspberry|second brain|personal ai|personal agent|whatsapp|sqlite|graph memory)\b/i, weight: 4 },
      { pattern: /\b(briefed on|govern a technology|outsource memory|outsource computation|learn by doing)\b/i, weight: 5 },
      { pattern: /\b(keynote|minister'?s keynote|diplomat'?s second brain)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'overall-event-recaps',
    label: 'Event recaps and hallway dispatches',
    summary:
      'Broad recaps and short dispatches captured the whole AIE Singapore texture: keynote, workshops, booths, hallway energy, side events, speaker moments, and the sense of a real builder room.',
    keywords: ['recaps', 'takeaways', 'highlights', 'hallway notes', 'conference format'],
    signals: [
      { pattern: /\b(recap|takeaways?|highlights?|still buzzing|what stuck|sessions? that stuck|favorite talks?|favourite talks?)\b/i, weight: 4 },
      { pattern: /\b(day one|day 1|day two|day 2|past three days|3 days|weekend at ai engineer|full weekend)\b/i, weight: 3 },
      { pattern: /\b(best conference|single track|family style|builder-first|conference format|whole event)\b/i, weight: 3 },
      { pattern: /\b(early bird|tickets?|agenda|what your ticket gets|lineups?|speaker lineup|speaker announcement|come say hi|in town for)\b/i, weight: 2 },
    ],
    storyType: 'broad_recap',
  },
  {
    storyId: 'openai-codex-presence',
    label: 'OpenAI Codex presence',
    summary:
      'OpenAI showed up through Codex booth demos, technical workshops, Codex for Everyone, FDE lunch chat, hack-night experiments, and Gabriel Chua day-by-day recaps.',
    keywords: ['openai', 'codex', 'fde', 'gabriel chua', 'hack night'],
    signals: [
      { pattern: /\b(codex|openai codex|codex for everyone|fde|forward deployed engineer|gabriel chua|gabriel-chua|chua)\b/i, weight: 5 },
      { pattern: /\b(openai|thibault|sottiaux|gpt|realtime|hack night|realtime hack)\b/i, weight: 3 },
      { pattern: /\b(codex booth|codex workshop|codex technical workshop)\b/i, weight: 5 },
    ],
  },
  {
    storyId: 'agentic-workshops',
    label: 'Workshops and agentic workflows',
    summary:
      'Hands-on sessions and leadership-track notes centered on AI engineering craft: LlamaIndex, agentic document workflows, x402/pay.sh, coding agents, evals, orchestration, and software-factory patterns.',
    keywords: ['workshops', 'agentic workflows', 'llamaindex', 'x402', 'software factories'],
    signals: [
      { pattern: /\b(workshop|workshops|hands-on|hands on|agentic workflow|agentic document|llamaindex|beyond rag|rag)\b/i, weight: 4 },
      { pattern: /\b(agentic engineering|coding agents?|code knowledge|business rules|repeatable system|software factories|software factory|leadership track)\b/i, weight: 4 },
      { pattern: /\b(x402|pay\.sh|agentic rag|enterprise documents?|document workflows?|evals?|evaluation|retrieval|parsing|reranking|orchestration|multi-agentic workflows?)\b/i, weight: 3 },
      { pattern: /\b(enterprise pdf|technical workshop|workshop-heavy|packed workshops?)\b/i, weight: 4 },
    ],
  },
  {
    storyId: 'research-talks-model-systems',
    label: 'Research talks and model systems',
    summary:
      'Research-track posts covered world models, physical AI, sovereign AI, MoE inference, Sakana AI, Reka, Cerebras, and deeper model-system talks.',
    keywords: ['research talks', 'world models', 'physical ai', 'sovereign ai', 'inference'],
    signals: [
      { pattern: /\b(world models?|physical ai|sovereign ai|moe|mixture of experts|inference|research track|research talk)\b/i, weight: 4 },
      { pattern: /\b(sakana|reka|cerebras|luma|reactor|bifrost|alberto|aravind|model systems?)\b/i, weight: 3 },
      { pattern: /\b(understand physics|simulate|simulation|robotics research|model space)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'students-organizers-community',
    label: 'Students, organizers and community gratitude',
    summary:
      'Community refs focused on student tickets, scholarship seats, organizer gratitude, volunteer energy, and warm posts naming Sherry Jiang, Agrim Singh, 65labs, Kaspar Hidayat, Ivan Leo, and Rachael De Foe.',
    keywords: ['students', 'organizers', '65labs', 'scholarships', 'community'],
    signals: [
      { pattern: /\b(student|students|scholarship|sponsored ticket|student seats?|waitlist|volunteer|organizers?|organisers?)\b/i, weight: 4 },
      { pattern: /\b(65labs|sherry|agrim|kaspar|ivan leo|rachael|de foe|hidayat|organizing team|organising team)\b/i, weight: 3 },
      { pattern: /\b(thank you|grateful|shout ?out|love|community|scene|you are the scene)\b/i, weight: 2 },
    ],
  },
  {
    storyId: 'sponsors-booths-hiring',
    label: 'Sponsor booths, partner rooms and hiring',
    summary:
      'Sponsor and partner refs covered booth presence, VIP dinners, founder happy hours, hiring, credits, partner selfies, and ecosystem participation from Google DeepMind, Exa, Arize, Vercel, Cloudflare, Cursor, and others.',
    keywords: ['sponsors', 'booths', 'hiring', 'partner rooms', 'credits'],
    signals: [
      { pattern: /\b(sponsor|sponsors|partner|partners|booth|expo|hiring|credits?|api credits?|giveaway)\b/i, weight: 4 },
      { pattern: /\b(google deepmind|deepmind|exa|arize|cloudflare|cursor|vercel|convex|aws|stripe|daytona|featherless|nebius|posthog)\b/i, weight: 3 },
      { pattern: /\b(happy hour|founder dinner|partner dinner|closed-door|closed door)\b/i, weight: 2 },
    ],
    storyType: 'sponsor',
  },
  {
    storyId: 'side-events-meetups',
    label: 'Road to AIE side events and meetups',
    summary:
      'Side-event refs covered AI Tinkerers, Tencent Cloud, Ralphthon, GFTN, Road to AIE meetups, Convex boba, happy hours, and the broader build-week circuit around the main conference.',
    keywords: ['side events', 'meetups', 'ai tinkerers', 'ralphthon', 'road to aie'],
    signals: [
      { pattern: /\b(side event|side events|meetup|meetups|ai tinkerers|tinkerers|ralphthon|gftn|tencent|built different)\b/i, weight: 4 },
      { pattern: /\b(road to aie|convex boba|happy hour|founder meetup|jupiter hq|network school|running with ai engineers)\b/i, weight: 4 },
      { pattern: /\b(build week|ai week|around the conference|orbiting the main conference)\b/i, weight: 2 },
    ],
    storyType: 'side_event',
  },
  {
    storyId: 'hackathon-build-week',
    label: 'Hackathons and build-week demos',
    summary:
      'Hackathon refs captured Road to AIE build nights, Ralphthon, project demos, prize money, sponsor challenges, API-credit offers, and 300-builder pre-conference rooms.',
    keywords: ['hackathon', 'build night', 'prizes', 'api credits', 'road to aie'],
    signals: [
      { pattern: /\b(ai engineer\s*(singapore\s*)?#?hackathon|aie\s*(singapore\s*)?hackathon|road to aie hackathon|ralphthon|build night|builder night|300 builders|7 hours|cash prizes?|sgd|\$3k|\$2k|\$1k)\b/i, weight: 5 },
      { pattern: /\b(prizes?|track prizes?|sponsor challenges?|api credits?|openai credits?|platform credits?|adaption labs credits?|smithery|mastra)\b/i, weight: 3 },
      { pattern: /\b(on-demand 3d panoramas|wiki ?racer|winning|won 2nd|demo vid)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'stage-demos-creative-ai',
    label: 'Stage demos and creative AI',
    summary:
      'Creative-demo refs included Reachy, robotics, rap battle moments, Synthaesthetic Art, demo-stage photos, and playful examples of AI as a visible live medium.',
    keywords: ['reachy', 'robotics', 'rap battle', 'creative ai', 'stage demos'],
    signals: [
      { pattern: /\b(reachy|pollen robotics|robot|robotics|rap battle|creative ai|synthaesthetic|demo stage|stage demo)\b/i, weight: 4 },
      { pattern: /\b(hugging face|kai-ming|live demo|dance|performance|art)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'leadership-enterprise',
    label: 'Leadership track and software factories',
    summary:
      'Leadership and enterprise refs covered software factories, deploying coding agents inside organizations, product/engineering workflow changes, and packed-house leadership-track sessions.',
    keywords: ['leadership track', 'software factories', 'enterprise', 'coding agents', 'organizations'],
    signals: [
      { pattern: /\b(leadership track|software factories|software factory|enterprise|inside organizations?|deploying coding agents|product leadership)\b/i, weight: 4 },
      { pattern: /\b(workflows? inside|organizational|management|teams|ownership|product and engineering)\b/i, weight: 2 },
    ],
  },
  {
    storyId: 'singapore-builder-scene',
    label: 'Singapore builder-scene signal',
    summary:
      'Scene-level refs debated or celebrated Singapore as an AI builder hub: room-size demand, local ownership, serious builders, regional energy, and occasional skeptical pushback.',
    keywords: ['singapore ai scene', 'builder hub', 'local scene', 'demand', 'skepticism'],
    signals: [
      { pattern: /\b(singapore (ai )?(scene|hub|builder|builders)|regional builder|locally owned|room-size problem|showed up|surface area)\b/i, weight: 4 },
      { pattern: /\b(skeptic|skeptical|reality check|delusional|trading hub|global ai hub|serious builders|access is)\b/i, weight: 4 },
      { pattern: /\b(scene-building|builder community|community energy|not a tour stop|not flown in)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'livestream-video-recordings',
    label: 'Livestreams and talk recordings',
    summary:
      'Video refs made the event visible beyond the room: official livestreams, uploaded talks, YouTube clips, source videos, and posts pointing people to recordings.',
    keywords: ['livestream', 'recordings', 'youtube', 'talk video', 'watch'],
    signals: [
      { pattern: /\b(livestream|live stream|streaming|youtube|recording|recordings|talk is now up|talk from ai engineer|watch the recording|video is up)\b/i, weight: 4 },
      { pattern: /\b(tune in live|talks kick off|source video|uploaded|41-min|41 min)\b/i, weight: 3 },
    ],
    storyType: 'logistics',
  },
];

const smallStoryMergeTargets: Record<string, string> = {
  'leadership-enterprise': 'agentic-workshops',
};

const primaryStoryOverrides: PrimaryStoryOverride[] = [
  {
    pattern: /\b(codex booth|openai @ ai engineer|openai at ai engineer|codexmaxxing|codex for everyone|codex technical workshop|show me something crazy.*codex|fde @ openai|forward deployed engineers? at openai)\b/i,
    storyId: 'openai-codex-presence',
  },
  {
    pattern: /\b(vivian|balakrishnan|foreign minister|minister for foreign affairs|nanoclaw|nano claw|raspberry pi|second brain|briefed on|govern a technology)\b/i,
    storyId: 'vivian-builder-keynote',
  },
  {
    pattern: /\b(don'?t want to dunk on singapore|delusional takes|mostly a trading hub|next silicon valley)\b/i,
    storyId: 'overall-event-recaps',
  },
  {
    pattern: /\b(20 students?|sponsored ticket|student tickets?|scholarship seats?|fully sponsored ticket)\b/i,
    storyId: 'students-organizers-community',
  },
  {
    pattern: /\b(diamond sponsor|platinum sponsor|gold sponsor|biggest sponsors?|sponsor lineup|first wave of sponsors|sponsor announcement|joining us as[\s\S]{0,80}sponsor|partnering up with 65labs)\b/i,
    storyId: 'sponsors-booths-hiring',
    subPattern: /\b(openai codex|codex)\b/i,
    subStoryId: 'openai-codex-presence',
  },
  {
    pattern: /\b(leadership track|software factories|software factory|deploying ai coding agents inside organizations)\b/i,
    storyId: 'agentic-workshops',
  },
  {
    pattern: /\b(ai engineer speaker reveal|speaker reveal:|early bird tickets|prices go up|what your ticket gets|tickets are live|ticket gets you)\b/i,
    storyId: 'overall-event-recaps',
  },
  {
    pattern: /\b(massive shoutout to 65labs|shoutout to 65labs|thank you to 65labs|organizing team|organising team|entire organizing team|entire organising team)\b/i,
    storyId: 'students-organizers-community',
  },
];

const config: EventConfig = {
  eventId: 'aie-2026',
  name: 'AI Engineer Summit Singapore 2026',
  stories,
  smallStoryMergeTargets,
  primaryStoryOverrides,
  corpusPhraseRules: [],
  singleTokenEntityAllowlist: [],
  curatedThemeCopy: {},
  atlasLanes: [],
  recapMode: 'auto',
};

export default config;
