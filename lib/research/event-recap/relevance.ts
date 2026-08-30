const AI_ENGINEERING_TERMS =
  /\b(agents?|agentic?|ai agents?|agent sandboxes?|sandboxes?|personal ai agent|ai assistant|second brain|codex|cursor|nanoclaw|raspberry pi|sqlite|graph memory|whatsapp|claude|openai|google deepmind|deepmind|llms?|large[-\s]?language models?|llamaindex|llama index|hugging face|elevenlabs|vercel|cloudflare|stripe|arize|exa|convex|greptile|featherless|miromind|z\.ai|magicpath|govtech|openclaw|opengraph|reactor|bifrost|minimax|sakana|cerebras|x402|pay\.sh|evals?|inference|computation|foundation models?|world models?|model launch|own stack|robotics?|robots?|brain[-\s]?computer|bci|synthetic data|developer|engineering|software|code|coding|api|workflows?|deploy(?:ed|ing)?|ai builders?|ai stuff|physical ai|creative ai models?|future of work|public infrastructure)\b/i;

const NON_LATIN_AI_ENGINEERING_TERMS =
  /(AI助手|智能体|人工智能|动手搭建|运用AI|资料.{0,16}检索|模型|技术|开发|工程)/iu;

const PROGRAM_TERMS =
  /\b(talk(?:s|ing)?|keynotes?|speakers?|speak|speaking|spoke|present(?:ed|ing)?|stage|workshops?|hackathons?|demos?|booths?|tracks?|sessions?|live\s?streams?|unconference|conferences?|conf|recaps?|speaker lineup|lineups?|leadership track|sponsor(?:s|ed)?|student tickets?|scholarships?)\b/i;

const EVENT_TECH_PHRASES =
  /\b(ai conference|ai engineering|ai engineer conference|ai engineer summit|ai scene|ai space|ml\/ai event|ai ecosystem|adaptive data credits|build(?:ing)? in ai|building at the frontier|builder[-\s]?first|builders?|build(?:ing)? ai|built\s+[^.]{0,80}\bai|shipped\s+[^.]{0,80}\bai|ai tinkerers|ralphthon|agent harness|vibe coding|vibecoding|painting with (their|my) mind)\b/i;

export function hasAiEngineeringOrProgramSignal(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    AI_ENGINEERING_TERMS.test(normalized) ||
    NON_LATIN_AI_ENGINEERING_TERMS.test(normalized) ||
    PROGRAM_TERMS.test(normalized) ||
    EVENT_TECH_PHRASES.test(normalized)
  );
}

export function isLowSignalEventOnlyText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  const hasTechnicalSignal =
    AI_ENGINEERING_TERMS.test(normalized) ||
    NON_LATIN_AI_ENGINEERING_TERMS.test(normalized) ||
    EVENT_TECH_PHRASES.test(normalized);
  if (hasTechnicalSignal) return false;
  return /\b(defining image|venue into a club|turned (?:the )?venue into a club|team war-room|still need to see you|coffee tips)\b/i.test(
    normalized
  );
}

export function hasEventContextSignal(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (hasAiEngineeringOrProgramSignal(normalized)) return true;
  return /\b(attend(?:ed|ing|ance)?|at ai engineer|in singapore for|day\s*[0-3]|main event|organis(?:e|ed|ing|er|ers)|organiz(?:e|ed|ing|er|ers)|pulled off|full circle|weekend|event started|live from|energy|vibes?|buzz|venue|after ?party|meet(?:up|ing)?|bump into|come say hi|say hi|dm|backstage|hallway|arrived|landed|closing out|thank you|grateful|shout ?out|congrats|bar has been raised|packed|lineup|joining us|hashtags?)\b/i.test(
    normalized
  );
}

export function isIncidentalAieMention(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const exactMentions = [
    ...normalized.matchAll(
      /\b(ai engineer singapore|ai engineers singapore|ai engineer sg|ai engineer summit singapore|ai engineer conference singapore|aie singapore|ai\.engineer[\/\s]+singapore|road to aie)\b|#(?:aiengineersingapore|aiengineersg|aiesg)\b/gi
    ),
  ];
  if (exactMentions.length !== 1 || normalized.length < 900) return false;

  const matchIndex = exactMentions[0]?.index ?? 0;
  const mentionWindow = normalized.slice(Math.max(0, matchIndex - 280), matchIndex + 420);
  const specificEventSignal =
    /\b(vivian balakrishnan|vivianbala|foreign minister|keynote|conference|summit|takeaways?|presented|workshops?|technical workshop|speakers?|talks?|panels?|sessions?|stage|booths?|sponsors?|side event|live demos?|capitol|kempinski|pullman|singapore management university|smu|65labs|openai|codex|cursor|google deepmind|deepmind|nanoclaw|llamaindex|cerebras|vercel|day\s*[123]|recap|livestream|unconference|project6|ralphthon|sherry jiang|sherrypeek|agrim singh|rachael de foe|gabriel chua|yee chien cheot)\b/i.test(
      mentionWindow
    );
  return !specificEventSignal;
}
