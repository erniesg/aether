export type EvidenceSourceKind = 'repo' | 'resume' | 'site';

export interface EvidenceSourceRef {
  kind: EvidenceSourceKind;
  ref: string;
}

export interface EvidenceClaim {
  text: string;
  source: EvidenceSourceRef;
}

export interface EvidenceFactSet {
  name: string;
  description: string;
  claims: EvidenceClaim[];
}

const TECH_RE =
  /\b(Next\.?js|React|TypeScript|JavaScript|Cloudflare Workers?|Convex|tldraw|OpenAI|Gemini|Replicate|Volcengine|Postgres|Supabase|Workers|Remotion|Tailwind|Vitest|Playwright)\b/i;

interface ResumeFactsInput {
  text: string;
  ref: string;
  name?: string;
}

interface SiteFactsInput {
  markdown?: string;
  html?: string;
  url: string;
  name?: string;
}

export function extractResumeFacts(input: ResumeFactsInput): EvidenceFactSet {
  const claims = extractClaimLines(input.text, {
    source: { kind: 'resume', ref: input.ref },
    min: 3,
  });
  return {
    name: input.name?.trim() || labelFromRef(input.ref) || 'resume',
    description: 'uploaded resume evidence',
    claims,
  };
}

export function extractSiteFacts(input: SiteFactsInput): EvidenceFactSet {
  const text = input.markdown ?? htmlToText(input.html ?? '');
  const claims = extractClaimLines(text, {
    source: { kind: 'site', ref: input.url },
    min: 2,
  });
  return {
    name: input.name?.trim() || hostnameLabel(input.url) || 'site',
    description: 'site evidence',
    claims,
  };
}

function extractClaimLines(
  text: string,
  opts: { source: EvidenceSourceRef; min: number }
): EvidenceClaim[] {
  const seen = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .flatMap((line) => splitSentenceLike(line))
    .map(cleanClaimText)
    .filter(Boolean);

  const ranked = [...lines].sort((a, b) => scoreClaim(b) - scoreClaim(a));
  const claims: EvidenceClaim[] = [];
  for (const line of ranked) {
    if (claims.length >= Math.max(opts.min, 8)) break;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    if (scoreClaim(line) <= 0 && claims.length >= opts.min) continue;
    seen.add(key);
    claims.push({ text: line, source: opts.source });
  }
  return claims.slice(0, Math.max(opts.min, 8));
}

function splitSentenceLike(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (/^[-*]\s+/.test(trimmed)) return [trimmed];
  return trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
}

function cleanClaimText(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;]\s*$/, '.')
    .slice(0, 240);
}

function scoreClaim(line: string): number {
  let score = 0;
  if (/\d/.test(line)) score += 3;
  if (TECH_RE.test(line)) score += 3;
  if (/\b(built|led|shipped|launched|ran|created|designed|deployed|projects?|includes?)\b/i.test(line)) {
    score += 1;
  }
  if (line.length >= 24 && line.length <= 220) score += 1;
  return score;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelFromRef(ref: string): string {
  return ref
    .split('/')
    .pop()
    ?.replace(/\.[a-z0-9]+$/i, '')
    .trim() ?? '';
}

function hostnameLabel(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw.trim();
  }
}
