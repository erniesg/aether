const AI_ENGINEERING_TERMS =
  /\b(agentic?|ai agents?|personal ai agent|ai assistant|second brain|codex|cursor|nanoclaw|raspberry pi|sqlite|graph memory|whatsapp|claude|openai|google deepmind|deepmind|llamaindex|llama index|hugging face|elevenlabs|vercel|cloudflare|stripe|arize|exa|convex|greptile|featherless|miromind|z\.ai|magicpath|govtech|openclaw|opengraph|reactor|bifrost|minimax|sakana|cerebras|x402|pay\.sh|evals?|inference|foundation models?|world models?|robotics?|robots?|brain[-\s]?computer|bci|synthetic data|developer|engineering|software|code|coding|api|workflows?|deploy(?:ed|ing)?|ai builders?|ai stuff|physical ai|creative ai models?|future of work)\b/i;

const NON_LATIN_AI_ENGINEERING_TERMS =
  /(AI助手|智能体|人工智能|动手搭建|运用AI|资料.{0,16}检索|模型|技术|开发|工程)/iu;

const PROGRAM_TERMS =
  /\b(talks?|keynotes?|speakers?|speak|speaking|spoke|present(?:ed|ing)?|stage|workshops?|hackathons?|demos?|booths?|tracks?|sessions?|livestream|unconference|conferences?|conf|recaps?|speaker lineup|lineups?|leadership track|sponsor(?:s|ed)?|student tickets?|scholarships?)\b/i;

const EVENT_TECH_PHRASES =
  /\b(ai conference|ai engineering|ai engineer conference|ai engineer summit|ai scene|ai space|build(?:ing)? in ai|building at the frontier|builder[-\s]?first|builders?|build(?:ing)? ai|built\s+[^.]{0,80}\bai|shipped\s+[^.]{0,80}\bai|ai tinkerers|ralphthon|agent harness|vibe coding|vibecoding|painting with (their|my) mind)\b/i;

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
