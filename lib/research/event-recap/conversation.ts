import type { EventPost } from './types';

export type ConversationIntent =
  | 'sentiment'
  | 'question'
  | 'resource'
  | 'announcement'
  | 'hiring'
  | 'other';

export type ConversationSentiment = 'positive' | 'negative' | 'mixed' | 'neutral';

export interface ConversationClassification {
  intent: ConversationIntent;
  sentiment: ConversationSentiment;
  score: number;
  reasons: string[];
}

const HIRING_RE =
  /\b(hiring|we'?re hiring|job opening|job ad|apply now|candidate|recruiting|resume|cv|vacancy)\b/i;

const ANNOUNCEMENT_RE =
  /\b(join us|register|tickets|agenda|speaker lineup|we'?re excited|we are excited|announcing|proud to sponsor|visit our booth|booth|come meet|don't miss|save your seat|happening now|see you at|we'?ll be at|we are at|keynote|panel session)\b/i;

const RESOURCE_RE = /\b(recap|notes|slides|recording|writeup|thread|takeaways|summary|resources)\b/i;
const QUESTION_RE = /\?|(\b(how|why|what|anyone|does anyone|curious|wondering)\b.*\b(ai|engineer|agent|llm|singapore|summit)\b)/i;

const OPINION_RE =
  /\b(i think|i feel|i learned|i noticed|my take|takeaway|hot take|surprised|interesting|loved|wish|concern|skeptical|excited|impressed|useful|practical|pain|hard|boring|best|worst)\b/i;

const POSITIVE_RE =
  /\b(love|loved|great|excellent|useful|practical|impressive|impressed|excited|good|valuable|strong|clear|insightful|helpful|promising)\b/i;
const NEGATIVE_RE =
  /\b(hard|pain|concern|concerned|skeptical|boring|bad|worse|worst|overhyped|unclear|missing|failed|problem|risk|risks|disappointed)\b/i;

export function classifyConversationPost(post: Pick<EventPost, 'text' | 'tags'>): ConversationClassification {
  const text = post.text.trim();
  const tags = post.tags.join(' ');
  const blob = `${text} ${tags}`;
  const reasons: string[] = [];
  let intent: ConversationIntent = 'other';
  let score = 0;

  if (HIRING_RE.test(blob) || /hiring|candidate|job/i.test(tags)) {
    intent = 'hiring';
    score -= 6;
    reasons.push('hiring language');
  } else if (QUESTION_RE.test(text)) {
    intent = 'question';
    score += 5;
    reasons.push('question or curiosity');
  } else if (OPINION_RE.test(text) || firstPersonSignal(text)) {
    intent = 'sentiment';
    score += 6;
    reasons.push('opinion or first-person reaction');
  } else if (RESOURCE_RE.test(text)) {
    intent = 'resource';
    score += 3;
    reasons.push('recap or resource');
  } else if (ANNOUNCEMENT_RE.test(text)) {
    intent = 'announcement';
    score -= 4;
    reasons.push('announcement language');
  }

  const positive = POSITIVE_RE.test(text);
  const negative = NEGATIVE_RE.test(text);
  const sentiment: ConversationSentiment =
    positive && negative ? 'mixed' : positive ? 'positive' : negative ? 'negative' : 'neutral';
  if (sentiment !== 'neutral') score += 2;

  return { intent, sentiment, score, reasons };
}

export function enrichPostConversationTags<T extends EventPost>(post: T): T {
  const classification = classifyConversationPost(post);
  const tags = post.tags.filter(
    (tag) => !tag.startsWith('intent:') && !tag.startsWith('sentiment:')
  );
  tags.push(`intent:${classification.intent}`, `sentiment:${classification.sentiment}`);
  if (isConversationClassification(classification)) tags.push('conversation');
  return {
    ...post,
    tags: Array.from(new Set(tags)),
  };
}

export function isConversationPost(post: Pick<EventPost, 'text' | 'tags'>): boolean {
  return isConversationClassification(classifyConversationPost(post));
}

function isConversationClassification(classification: ConversationClassification): boolean {
  return (
    classification.intent === 'sentiment' ||
    classification.intent === 'question' ||
    classification.intent === 'resource'
  );
}

function firstPersonSignal(text: string): boolean {
  return /\b(i|we|my|our)\b/i.test(text) && /\b(think|feel|learned|built|tried|saw|heard|noticed|want|need|wish)\b/i.test(text);
}
