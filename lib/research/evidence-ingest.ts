import {
  extractResumeFacts,
  extractSiteFacts,
  type EvidenceFactSet,
} from './evidence-facts';
import { fetchRepoFacts, type ProjectFacts } from './repo-facts';
import { enrichProjectFacts } from '@/lib/providers/enrichment/registry';
import { normalizeHttpUrlInput } from '@/lib/url/normalize';

export type EvidenceIngestKind = 'repo' | 'resume' | 'site';

export interface EvidenceIngestRequest {
  workspaceId?: string;
  kind: EvidenceIngestKind;
  source: unknown;
}

export interface EvidenceIngestResult {
  facts: ProjectFacts | EvidenceFactSet;
  persisted: boolean;
}

interface EvidenceIngestOptions {
  fetcher?: typeof fetch;
}

export async function ingestEvidenceFacts(
  request: EvidenceIngestRequest,
  opts: EvidenceIngestOptions = {}
): Promise<EvidenceIngestResult> {
  if (request.kind === 'repo') {
    if (typeof request.source !== 'string' || !request.source.trim()) {
      throw new Error('repo evidence requires a source URL');
    }
    const repoUrl = normalizeHttpUrlInput(request.source);
    const githubFacts = await fetchRepoFacts(repoUrl, { fetcher: opts.fetcher });
    const facts = await enrichProjectFacts(githubFacts, { url: repoUrl });
    return { facts, persisted: false };
  }

  if (request.kind === 'resume') {
    const resume = coerceResumeSource(request.source);
    return {
      facts: extractResumeFacts(resume),
      persisted: false,
    };
  }

  if (request.kind === 'site') {
    const site = await coerceSiteSource(request.source, opts.fetcher ?? fetch);
    return {
      facts: extractSiteFacts(site),
      persisted: false,
    };
  }

  throw new Error(`unsupported evidence kind: ${String((request as { kind?: unknown }).kind)}`);
}

function coerceResumeSource(source: unknown): { text: string; ref: string } {
  if (typeof source === 'string') return { text: source, ref: 'resume.md' };
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('resume evidence requires text');
  }
  const record = source as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text : '';
  if (!text.trim()) throw new Error('resume evidence requires text');
  return {
    text,
    ref: typeof record.ref === 'string' && record.ref.trim() ? record.ref : 'resume.md',
  };
}

async function coerceSiteSource(
  source: unknown,
  fetcher: typeof fetch
): Promise<{ markdown?: string; html?: string; url: string }> {
  if (typeof source === 'string') {
    const url = normalizeHttpUrlInput(source);
    const res = await fetcher(url, {
      headers: { 'User-Agent': 'aether-evidence-ingest/0.1' },
    });
    if (!res.ok) throw new Error(`site fetch failed: ${res.status}`);
    return { html: await res.text(), url };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('site evidence requires a URL or markdown payload');
  }
  const record = source as Record<string, unknown>;
  const url = typeof record.url === 'string' ? normalizeHttpUrlInput(record.url) : '';
  if (!url) throw new Error('site evidence requires url');
  const markdown = typeof record.markdown === 'string' ? record.markdown : undefined;
  const html = typeof record.html === 'string' ? record.html : undefined;
  if (!markdown && !html) throw new Error('site evidence requires markdown or html');
  return { markdown, html, url };
}
