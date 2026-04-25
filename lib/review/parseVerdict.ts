// Reviewer agent verdict parsing.
//
// The reviewer agent is instructed to end its PR comment with one of three
// exact strings:
//
//   VERDICT: APPROVE
//   VERDICT: REQUEST_CHANGES
//   VERDICT: BLOCK
//
// CI's post-review routing step (see .github/workflows-proposed/claude-review.yml)
// greps the comment body and dispatches based on the parsed verdict. This
// parser is the single source of truth for that extraction so the workflow
// shell step and any in-process test harness agree.
//
// Design choices:
// - Match the LAST occurrence of a `VERDICT: <value>` line — the reviewer may
//   quote the token elsewhere in its reasoning (e.g. inside a code fence), and
//   the final line is the authoritative one.
// - Tolerate surrounding markdown emphasis (`**VERDICT: APPROVE**`,
//   `_VERDICT: BLOCK_`). The acceptance criteria says the comment "ends with"
//   one of the exact strings, but in practice Claude Code will sometimes wrap
//   the line. Strict-mode workflow can still pin the exact suffix.
// - Reject unknown verdict tokens (return null) rather than guessing.

export type ReviewVerdict = 'APPROVE' | 'REQUEST_CHANGES' | 'BLOCK';

const VERDICT_VALUES = ['APPROVE', 'REQUEST_CHANGES', 'BLOCK'] as const;

// Captures `VERDICT: <TOKEN>` where TOKEN is one of the three allowed values.
// The `g` flag lets us iterate and keep the last match. Terminator is a
// negative lookahead for uppercase letters rather than \b — \b treats `_` as a
// word character, which breaks the markdown-emphasis tolerance case
// (`_VERDICT: BLOCK_`). `(?![A-Z])` rejects accidental partial matches like
// `APPROVED` while allowing `*` / `_` / whitespace / EOS as valid boundaries.
const VERDICT_LINE = /VERDICT:\s*(APPROVE|REQUEST_CHANGES|BLOCK)(?![A-Z])/g;

export function parseVerdict(commentBody: string | null | undefined): ReviewVerdict | null {
  if (!commentBody) return null;

  VERDICT_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let last: ReviewVerdict | null = null;
  while ((match = VERDICT_LINE.exec(commentBody)) !== null) {
    last = match[1] as ReviewVerdict;
  }
  return last;
}

export function isReviewVerdict(value: unknown): value is ReviewVerdict {
  return typeof value === 'string' && (VERDICT_VALUES as readonly string[]).includes(value);
}
