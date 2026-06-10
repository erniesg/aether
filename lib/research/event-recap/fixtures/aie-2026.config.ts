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
      { pattern: /\b(新加坡外长|维文|维文医生|外长维文)\b/i, weight: 4 },
      { pattern: /\b(minister'?s keynote|diplomat'?s second brain|dr\.?\s+vivian'?s?\s+keynote|vivian(?: balakrishnan)?'?s?\s+keynote)\b/i, weight: 3 },
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
      { pattern: /\b(agent deployment|production deployment patterns?|institutional knowledge|context infrastructure|agent stack|memory infrastructure|performance guarantees?|operational discipline|production ai agents?|agents write most pull requests)\b/i, weight: 4 },
      { pattern: /\b(enterprise pdf|technical workshop|workshop-heavy|packed workshops?)\b/i, weight: 4 },
    ],
  },
  {
    storyId: 'research-talks-model-systems',
    label: 'Research talks and model systems',
    summary:
      'Research posts covered world models, physical AI, sovereign AI, MoE inference, Sakana AI, Reka, Cerebras, and deeper model-system talks.',
    keywords: ['research talks', 'world models', 'physical ai', 'sovereign ai', 'inference'],
    signals: [
      { pattern: /\b(world models?|physical ai|sovereign ai|moe|mixture of experts|inference|research track|research talk)\b/i, weight: 4 },
      { pattern: /\b(sakana|reka|cerebras|luma|reactor|bifrost|alberto|aravind|model systems?)\b/i, weight: 3 },
      { pattern: /\b(understand physics|simulate|simulation|sim-to-real|robotics research|robotics stack|robot training data|robotics deployment|robot foundation models?|model space|scaling evals for robotics)\b/i, weight: 3 },
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
      'Sponsor and partner refs covered booth presence, founder happy hours, hiring, credits, partner selfies, and ecosystem participation from Google DeepMind, Exa, Arize, Vercel, Cursor, and other tool teams.',
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
      'Side-event refs covered AI Tinkerers, Tencent Cloud, ClawCon/OpenClaw, GFTN, Road to AIE meetups, Convex boba, happy hours, and the broader meetup circuit around the main conference.',
    keywords: ['side events', 'meetups', 'ai tinkerers', 'clawcon', 'road to aie'],
    signals: [
      { pattern: /\b(side event|side events|meetup|meetups|ai tinkerers|tinkerers|ralphthon|clawcon|openclaw|gftn|tencent|built different)\b/i, weight: 4 },
      { pattern: /\b(road to aie|road to ai engineer|convex boba|happy hour|founder meetup|jupiter hq|network school|running with ai engineers)\b/i, weight: 4 },
      { pattern: /\b(build week|ai week|around the conference|orbiting the main conference)\b/i, weight: 2 },
    ],
    storyType: 'side_event',
  },
  {
    storyId: 'clawcon-openclaw-side-event',
    label: 'ClawCon and OpenClaw side event',
    summary:
      'ClawCon/OpenClaw refs belong to the Road-to-AIE side-event circuit when they carry concrete ClawCon, OpenClaw Singapore, personal-AI festival, Jupiter HQ, AWS room, demo, or registration evidence.',
    keywords: ['clawcon', 'openclaw', 'personal ai', 'jupiter hq', 'road to aie'],
    signals: [
      { pattern: /\b(clawcon|clawcon singapore|openclaw singapore|openclawsg|@clawcon|@openclawsg)\b/i, weight: 6 },
      { pattern: /\b(road to aie|road to ai engineer|jupiter hq|aws|festival of personal ai|personal ai festival|500\+|registered|come say hi)\b/i, weight: 4 },
      {
        pattern:
          /\b(clawcon|openclaw)\b[\s\S]{0,140}\b(personal ai|own personal ai agents?|demos?|builders?|community|side event|side-event)\b|\b(personal ai|own personal ai agents?|demos?|builders?|community|side event|side-event)\b[\s\S]{0,140}\b(clawcon|openclaw)\b/i,
        weight: 3,
      },
    ],
    storyType: 'side_event',
  },
  {
    storyId: 'hackathon-build-week',
    label: 'Hackathons and build-week demos',
    summary:
      'Hackathon refs captured Road to AIE build nights, Ralphthon, project demos, prize money, sponsor challenges, credit offers, and 300-builder pre-conference rooms.',
    keywords: ['hackathon', 'build night', 'prizes', 'api credits', 'road to aie'],
    signals: [
      { pattern: /\b(ai engineer\s*(?:singapore\s*)?#?hackathon|ai engineer hackathon|aie\s*(singapore\s*)?hackathon|road to aie hackathon|ralphthon|build night|builder night|300 builders|7 hours|cash prizes?|sgd|\$3k|\$2k|\$1k)\b/i, weight: 5 },
      { pattern: /\b(prizes?|track prizes?|sponsor challenges?|api credits?|openai credits?|platform credits?|adaption labs credits?|smithery|mastra)\b/i, weight: 3 },
      { pattern: /\b(on-demand 3d panoramas|wiki ?racer|winning|won 2nd|demo vid)\b/i, weight: 3 },
    ],
  },
  {
    storyId: 'stage-demos-creative-ai',
    label: 'Stage demos and creative AI',
    summary:
      'Creative refs included Reachy, robotics, rap battle moments, Synthaesthetic Art, demo-stage photos, and playful examples of AI as a visible live medium.',
    keywords: ['reachy', 'robotics', 'rap battle', 'creative ai', 'stage demos'],
    signals: [
      { pattern: /\b(reachy|pollen robotics|rap battle|creative ai|synthaesthetic|demo stage|stage demo|the robot company|robotic painting|robot arm|teleoperat(?:e|ing|ion)|brain-computer|on-brand designs?|open in editor|visual treats?)\b/i, weight: 4 },
      { pattern: /\b(hugging face|kai-ming|live robotic demo|robot dance|creative performance|synthaesthetic art|tesseract mindflow)\b/i, weight: 3 },
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
    label: 'Talk videos and recordings',
    summary:
      'Video refs made the event visible beyond the room: official live streams, uploaded talks, YouTube clips, source videos, and posts pointing people to recordings.',
    keywords: ['livestream', 'recordings', 'youtube', 'talk video', 'watch'],
    signals: [
      {
        pattern:
          /\b(livestream|live stream|streaming|youtube version|youtube upload|youtube channel|talk is now up|my talk from ai engineer is now up|talk from ai engineer is now up|watch(?:ing)?(?: the)? (?:livestream|live stream|recording|talk)|video is up)\b/i,
        weight: 4,
      },
      { pattern: /\b(tune in live|talks kick off|source video|uploaded|41-min|41 min)\b/i, weight: 3 },
    ],
    storyType: 'logistics',
  },
];

const smallStoryMergeTargets: Record<string, string> = {
  'leadership-enterprise': 'agentic-workshops',
  'clawcon-openclaw-side-event': 'side-events-meetups',
};

const primaryStoryOverrides: PrimaryStoryOverride[] = [
  {
    pattern: /\b(codex booth|openai @ ai engineer|openai at ai engineer|codexmaxxing|codex for everyone|codex technical workshop|show me something crazy.*codex|fde @ openai|forward deployed engineers? at openai)\b/i,
    storyId: 'openai-codex-presence',
  },
  {
    pattern:
      /\b(gave|led|ran|hosted|taught|joined|attended|packed|90[-\s]?min|technical|hands[-\s]?on)\b[\s\S]{0,90}\bworkshops?\b|\bworkshops?\b[\s\S]{0,90}\b(gave|led|ran|hosted|taught|joined|attended|questions|packed|90[-\s]?min|technical|hands[-\s]?on)\b/i,
    storyId: 'agentic-workshops',
  },
  {
    pattern:
      /\b(agent deployment|production deployment patterns?|institutional knowledge|context infrastructure|agent stack|memory infrastructure|performance guarantees?|operational discipline|building ai agents that perform|agents write most pull requests)\b/i,
    storyId: 'agentic-workshops',
  },
  {
    pattern:
      /\b(youtube video:\s*aie singapore day\s*[12]\b|my talk from ai engineer(?: singapore)? is now up|talk from ai engineer(?: singapore)? is now up|talk is now up|live streams? are available|livestream for (?:the )?last day|youtube version|youtube upload|video is up)\b/i,
    storyId: 'livestream-video-recordings',
  },
  {
    pattern:
      /\b(ralphthonsg|ralphthon@sg)\b|(?:\bralphthon\b[\s\S]{0,180}\b(agent[-\s]?coding|coding agents?|agents?\s+code|demos?|prizes?|winners?|won|lobster rule|lobster hat|hackathon|ralph loop|project|ship|built|api credits?))|(?:(agent[-\s]?coding|coding agents?|agents?\s+code|demos?|prizes?|winners?|won|lobster rule|lobster hat|hackathon|ralph loop|project|ship|built|api credits?)[\s\S]{0,180}\bralphthon\b)/i,
    storyId: 'hackathon-build-week',
  },
  {
    pattern:
      /\b(ai engineer\s*(?:singapore\s*)?#?hackathon|ai engineer hackathon|aie\s*(?:singapore\s*)?hackathon|road to aie hackathon|hackathon[\s\S]{0,120}\b(road to aie|road to ai engineer)|(?:road to aie|road to ai engineer)[\s\S]{0,120}\bhackathon)\b/i,
    storyId: 'hackathon-build-week',
  },
  {
    pattern:
      /\b(clawcon|openclaw singapore|openclawsg|@clawcon|@openclawsg)\b[\s\S]{0,180}\b(road to aie|road to ai engineer|ai engineer singapore|singapore|jupiter hq|aws|festival|personal ai|500\+|registered|side event|demos?)\b|\b(road to aie|road to ai engineer|ai engineer singapore|singapore|jupiter hq|aws|festival|personal ai|500\+|registered|side event|demos?)\b[\s\S]{0,180}\b(clawcon|openclaw singapore|openclawsg|@clawcon|@openclawsg)\b/i,
    storyId: 'clawcon-openclaw-side-event',
  },
  {
    pattern: /\b(20 students?|sponsored ticket|student tickets?|student scholars?|scholarship seats?|fully sponsored ticket)\b/i,
    storyId: 'students-organizers-community',
  },
  {
    pattern:
      /\b(you are the scene|volunteers? who|volunteer lead|labor of love|labour of love|it takes a village|massive shoutout to 65labs|shoutout to 65labs|thank you to 65labs|organizing team|organising team|entire organizing team|entire organising team|ai engineer singapore starts tomorrow and i have some last minute thoughts)\b/i,
    storyId: 'students-organizers-community',
  },
  {
    pattern:
      /\b(diamond sponsor|platinum sponsor|gold sponsor|biggest sponsors?|sponsor lineup|first wave of sponsors|sponsor announcement|joining us as[\s\S]{0,80}sponsor|partnering up with 65labs)\b/i,
    storyId: 'sponsors-booths-hiring',
    subPattern: /\b(openai codex|codex)\b/i,
    subStoryId: 'openai-codex-presence',
  },
  {
    pattern: /\b(leadership track|software factories|software factory|deploying ai coding agents inside organizations)\b/i,
    storyId: 'agentic-workshops',
  },
  {
    pattern:
      /\b(ai engineer speaker reveal|speaker reveal:|early bird tickets|prices go up|what your ticket gets|tickets are live|ticket gets you|speaker applications? (?:are )?now open|cfp closes|convince your boss|code with ai classes|last call for saturday)\b/i,
    storyId: 'overall-event-recaps',
  },
  {
    pattern: /\b(don'?t want to dunk on singapore|delusional takes|mostly a trading hub|next silicon valley)\b/i,
    storyId: 'overall-event-recaps',
  },
  {
    pattern:
      /\b(scaling evals for robotics|robotics stack|sim-to-real|robot training data|robotics deployment|robot foundation models?|bifrost|world models?|physical ai|sovereign ai|mixture of experts|moe inference)\b/i,
    storyId: 'research-talks-model-systems',
  },
  {
    pattern: /\b(vivian|balakrishnan|foreign minister|minister for foreign affairs|nanoclaw|nano claw|raspberry pi|second brain|briefed on|govern a technology|新加坡外长|维文|维文医生|外长维文)\b/i,
    storyId: 'vivian-builder-keynote',
    skipWhenBroad: true,
  },
];

const config: EventConfig = {
  eventId: 'aie-2026',
  name: 'AI Engineer Summit Singapore 2026',
  stories,
  smallStoryMergeTargets,
  primaryStoryOverrides,
  corpusPhraseRules: [
    { value: 'Road to AIE', pattern: /\broad to (?:aie|ai engineer(?: singapore)?)\b/i },
    { value: 'AI Engineer SG', pattern: /\bai engineer sg\b/i },
    { value: 'AIE SG', pattern: /\baie\s+sg\b/i },
    { value: 'AIE2026', pattern: /\b#?aie2026\b/i },
    { value: 'AI Engineer Summit Singapore', pattern: /\bai engineer summit singapore\b/i },
    { value: 'AI Engineer side event', pattern: /\b(?:ai engineer\s+)?side events?\b/i },
    { value: 'AI Engineer workshop', pattern: /\b(?:ai engineer\s+)?workshops?\b/i },
    { value: 'AI Engineer hackathon', pattern: /\b(?:ai engineer\s+)?hackathon\b/i },
    { value: 'Codex Booth', pattern: /\bcodex booth\b/i },
    { value: 'feel-the-AGI', pattern: /\bfeel[-\s]the[-\s]agi\b/i },
    { value: 'Second Brain', pattern: /\bsecond brain\b/i },
    { value: 'personal AI stack', pattern: /\bpersonal ai stack\b/i },
    { value: 'Cabinet Minister', pattern: /\bcabinet minister\b/i },
    { value: 'Foreign Affairs', pattern: /\bforeign affairs\b/i },
    { value: 'NanoClaw', pattern: /\bnanoclaw\b/i },
    { value: 'long-running agents', pattern: /\blong[-\s]running agents\b/i },
    { value: 'agentic AI', pattern: /\bagentic ai\b/i },
    { value: 'vibe coding', pattern: /\bvibe[-\s]coding\b/i },
    { value: 'AI Builders Meetup', pattern: /\bai builders meetup\b/i },
    { value: 'student ticket', pattern: /\b(?:student|sponsored) tickets?\b/i },
    { value: 'fully sponsored ticket', pattern: /\bfully sponsored ticket\b/i },
    { value: 'Capitol Kempinski', pattern: /\bcapitol kempinski\b/i },
    { value: 'Pullman', pattern: /\bpullman\b/i },
    { value: 'SMU', pattern: /\bsmu\b/i },
  ],
  singleTokenEntityAllowlist: [
    'AIE',
    'Arize',
    'Cerebras',
    'Claude',
    'Codex',
    'Convex',
    'Cursor',
    'Daytona',
    'Exa',
    'Gemini',
    'HuggingFace',
    'MiniMax',
    'Minister',
    'NanoClaw',
    'OpenAI',
    'Pullman',
    'SMU',
    'Tusk',
    'Vercel',
  ],
  curatedThemeCopy: {
    'story-vivian-builder-keynote': {
      label: "Vivian's builder keynote",
      summary:
        'Foreign Minister Vivian Balakrishnan, NanoClaw, Raspberry Pi, and the "briefed on" line are one story: the keynote travelled because governance was framed through a minister visibly building and using his own AI workflow.',
    },
    'atlas-01-minister-balakrishnan-built': {
      label: "Minister's builder keynote",
      summary:
        'Foreign Minister Vivian Balakrishnan, NanoClaw, and the "briefed on" line drove the largest cross-platform spike, carried by high-view X clips plus LinkedIn recaps from Rachael De Foe, Sherry Jiang, and Yee Chien Cheot.',
    },
    'atlas-02-openai-cursor-codex': {
      label: 'OpenAI Codex presence',
      summary:
        'OpenAI showed up through the Codex booth, technical workshops, FDE lunch chat, Gabriel Chua daily recaps, and student-seat posts that treated the workshops as core event value.',
    },
    'atlas-03-agrimsingh-hackathon-second-brain': {
      label: 'Singapore builder debate',
      summary:
        'This cluster holds the argument around Singapore as a serious AI builder hub: organizer context from Agrim and 65labs, attendee day-two recaps, livestream reactions, and skeptical X pushback.',
    },
    'atlas-04-hackathon-kaspar-hidayat-video': {
      label: 'Livestreams and demos',
      summary:
        'Video and livestream refs made the event visible beyond the room, from Vivian Bala personal-agent posts to Day 2 YouTube coverage, Google DeepMind booth notes, and demo-stage moments.',
    },
    'atlas-05-aie-software-own': {
      label: 'Hallway energy',
      summary:
        'Attendees described dense hallway and VIP-dinner energy: startup/operator meetings, reconnections, practical leadership-track takeaways, and the feeling of many builders in one room.',
    },
    'atlas-06-openai-codex-kaspar-hidayat': {
      label: 'Scene afterglow',
      summary:
        'Post-event reflection clustered around "you are the scene", speaker recaps, OpenAI/Codex context, and people still processing how intense the weekend felt.',
    },
    'atlas-07-hackathon-live-say': {
      label: 'Side events and travel',
      summary:
        'Ralphthon, demo-stage posts, travel notes, sponsor side events, and livestream pointers show the broader AI week orbiting the main conference.',
    },
    'atlas-08-codex-night-hack': {
      label: 'Hack nights and unconference',
      summary:
        'Hack nights, unconference threads, Codex realtime experiments, and Road to AIE meetups turned the conference into a longer builder circuit rather than a single weekend.',
    },
    'atlas-09-google-google-deepmind-deepmind': {
      label: 'Sponsor ecosystem',
      summary:
        'Google DeepMind, Vercel, Cursor, and other sponsor or partner signals appeared through official livestreams, booth photos, happy-hour posts, and broader ecosystem recaps.',
    },
    'atlas-09-hackathon-talk-openai': {
      label: 'Around AIE: talks and side events',
      summary:
        'This story captures the wider AIE week around the main conference: talk recordings, sponsor booths, VIP dinners, hackathon notes, Ralphthon and AI Tinkerers side events, and visiting-builder recaps.',
    },
    'atlas-10-looking-kaspar-hidayat-codex': {
      label: 'Speakers and returning builders',
      summary:
        'Speakers and visiting builders used the event to reconnect the regional scene, with posts from Mark Doyle, Jim, Yong Quan, and others arranging talks, meetups, and return visits.',
    },
    'atlas-11-code-workshop-agentic': {
      label: 'Workshops and agentic workflows',
      summary:
        'Workshop-heavy refs centered on agentic workflows, x402 and payments, LlamaIndex enterprise-document sessions, Cerebras inference, and concrete implementation craft.',
    },
  },
  incidentalMentionPatterns: {
    exactMentions:
      /\b(ai engineer singapore|ai engineers singapore|ai engineer sg|ai engineer summit singapore|ai engineer conference singapore|aie singapore|ai\.engineer[\/\s]+singapore|road to aie)\b|#(?:aiengineersingapore|aiengineersg|aiesg)\b/gi,
    specificEventSignal:
      /\b(vivian balakrishnan|vivianbala|foreign minister|keynote|conference|summit|takeaways?|presented|workshops?|technical workshop|speakers?|talks?|panels?|sessions?|stage|booths?|sponsors?|side event|live demos?|capitol|kempinski|pullman|singapore management university|smu|65labs|openai|codex|cursor|google deepmind|deepmind|nanoclaw|llamaindex|cerebras|vercel|day\s*[123]|recap|livestream|unconference|project6|ralphthon|sherry jiang|sherrypeek|agrim singh|rachael de foe|gabriel chua|yee chien cheot)\b/i,
    minLength: 900,
  },
  // Atlas lanes mirror the regex matchers from workers/aie2026-vibes.ts:605-606.
  // Order matters: assignLane scans label-first then text-broad, so keynote is
  // checked before program/tools/community to give Vivian-shaped themes priority.
  atlasLanes: [
    {
      id: 'keynote',
      label: 'keynote + stage signal',
      x: 0.38,
      matcher: /\b(vivian|minister|balakrishnan|raspberry|nanoclaw|keynote|foreign affairs|second brain|stage moments?)\b/i,
    },
    {
      id: 'program',
      label: 'talks + research',
      x: 0.13,
      matcher: /\b(research|talks?|track|speaker|inference|world models?|leadership|program|sessions?)\b/i,
    },
    {
      id: 'tools',
      label: 'hands-on tools + demos',
      x: 0.62,
      matcher: /\b(codex|cursor|hack|api|credit|agentic|workflow|workshops?|demo|reachy|rap|creative|openai|software factories)\b/i,
    },
    {
      id: 'community',
      label: 'community + sponsors',
      x: 0.86,
      matcher: /\b(students?|organizers?|organisers?|sponsors?|booths?|hiring|happy hour|meetups?|dinners?|afterglow|side events?|tinkerers|tencent|road to|livestream|shoutouts?)\b/i,
    },
  ],
  recapMode: 'auto',
};

export default config;
