import { describe, expect, it } from 'vitest';
import { isReviewVerdict, parseVerdict } from '@/lib/review/parseVerdict';

describe('parseVerdict', () => {
  it('returns APPROVE when the comment ends with the exact APPROVE verdict', () => {
    const body = [
      'Reviewed diff, acceptance criteria, and artifact screenshots.',
      'All boxes ticked, tests green.',
      '',
      'VERDICT: APPROVE',
    ].join('\n');
    expect(parseVerdict(body)).toBe('APPROVE');
  });

  it('returns REQUEST_CHANGES for a request-changes verdict', () => {
    const body = 'Test coverage incomplete.\n\nVERDICT: REQUEST_CHANGES';
    expect(parseVerdict(body)).toBe('REQUEST_CHANGES');
  });

  it('returns BLOCK for a block verdict', () => {
    const body = 'Architectural red flag — escalate to human.\n\nVERDICT: BLOCK';
    expect(parseVerdict(body)).toBe('BLOCK');
  });

  it('returns null when no verdict is present', () => {
    expect(parseVerdict('Just some commentary with no verdict.')).toBeNull();
  });

  it('returns null for empty, null, or undefined input', () => {
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict(null)).toBeNull();
    expect(parseVerdict(undefined)).toBeNull();
  });

  it('rejects unknown verdict tokens', () => {
    // Reviewer agent went off-script. Fail closed so the workflow routes to
    // a human rather than guessing.
    const body = 'Summary line.\n\nVERDICT: MAYBE';
    expect(parseVerdict(body)).toBeNull();
  });

  it('takes the last verdict when multiple appear (reviewer may quote earlier ones)', () => {
    // The reviewer's prompt spec itself might echo the allowed verdicts (e.g.
    // inside a code fence). Only the final line is the authoritative verdict.
    const body = [
      '> Reference: VERDICT: APPROVE / VERDICT: REQUEST_CHANGES / VERDICT: BLOCK',
      '',
      'My assessment:',
      '',
      'VERDICT: REQUEST_CHANGES',
    ].join('\n');
    expect(parseVerdict(body)).toBe('REQUEST_CHANGES');
  });

  it('tolerates markdown emphasis around the verdict line', () => {
    expect(parseVerdict('**VERDICT: APPROVE**')).toBe('APPROVE');
    expect(parseVerdict('_VERDICT: BLOCK_')).toBe('BLOCK');
  });

  it('is case-sensitive on the verdict token to avoid soft matches', () => {
    // Claude Code normally emits uppercase. If lowercase leaks through, that
    // signals the prompt template drifted — fail closed.
    expect(parseVerdict('verdict: approve')).toBeNull();
  });

  it('ignores whitespace between "VERDICT:" and the value', () => {
    expect(parseVerdict('VERDICT:   APPROVE')).toBe('APPROVE');
  });
});

describe('isReviewVerdict', () => {
  it('narrows known verdict values', () => {
    expect(isReviewVerdict('APPROVE')).toBe(true);
    expect(isReviewVerdict('REQUEST_CHANGES')).toBe(true);
    expect(isReviewVerdict('BLOCK')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isReviewVerdict('approve')).toBe(false);
    expect(isReviewVerdict('UNKNOWN')).toBe(false);
    expect(isReviewVerdict(null)).toBe(false);
    expect(isReviewVerdict(undefined)).toBe(false);
    expect(isReviewVerdict(42)).toBe(false);
  });
});
