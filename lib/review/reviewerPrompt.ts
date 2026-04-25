// Reviewer-agent prompt builder.
//
// The reviewer is a fresh-context Claude invocation (no author conversation)
// triggered by `.github/workflows-proposed/claude-review.yml` on PRs whose
// head branch matches `claude/issue-*`. This module produces the prompt the
// workflow feeds to `anthropics/claude-code-action@v1` via `--prompt`.
//
// Inputs the reviewer sees:
//   - PR diff
//   - Linked issue's acceptance criteria (parsed from the issue body)
//   - Test summary (stdout snippet from `npm test`)
//   - PR description
//   - Artifact URLs (screenshots / screencap from the CF preview run)
//
// Output contract:
//   The reviewer MUST end its PR comment with one of the exact strings:
//     VERDICT: APPROVE
//     VERDICT: REQUEST_CHANGES
//     VERDICT: BLOCK
//   When BLOCK is caused by human-required visual/product ambiguity, the review
//   must include a clear reason, at least two concrete options, and artifact
//   URLs/screenshots so the human is choosing from evidence instead of a vague
//   escalation.
//   The post-review workflow step parses this via `parseVerdict`.

export interface ReviewerPromptInput {
  prNumber: number;
  prTitle: string;
  prDescription: string;
  prDiff: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  testSummary: string;
  artifactUrls: string[];
  strict?: boolean;
}

const STRICT_RUBRIC = `Grade strictly. Fail the PR if ANY of the following is true:
- An acceptance-criteria checkbox in the linked issue is not covered by a test in this diff.
- Tests pass but a human would notice the feature doesn't work from the artifact screenshots.
- The diff violates a hard rule in CLAUDE.md or AGENT-BRIEFING.md (UI taxonomy, provider-agnostic seams, typed provenance, single-workspace route).
- A provider / model name is hardcoded in business logic.
- The PR touches UI but no artifact screenshot demonstrates the happy path.`;

const LENIENT_RUBRIC = `Grade generously. Approve if:
- Acceptance-criteria checkboxes are satisfied, even if tests are partial.
- No egregious hard-rule violations.`;

export function buildReviewerPrompt(input: ReviewerPromptInput): string {
  const rubric = input.strict === false ? LENIENT_RUBRIC : STRICT_RUBRIC;

  const artifactSection = input.artifactUrls.length
    ? input.artifactUrls.map((u, i) => `  ${i + 1}. ${u}`).join('\n')
    : '  (no artifacts captured — flag this if the PR touches UI)';

  return `You are the reviewer agent for aether. You have FRESH CONTEXT — you have NOT
seen the author agent's conversation. Your job is an independent second opinion.

Read, in order:
1. The linked issue's acceptance criteria.
2. The PR diff.
3. The test summary.
4. The PR description (claimed deltas vs. actual diff).
5. The artifact screenshots (does the feature visibly work?).

Rubric:
${rubric}

Linked issue: #${input.issueNumber} — ${input.issueTitle}
PR: #${input.prNumber} — ${input.prTitle}

=== ISSUE BODY ===
${input.issueBody}

=== PR DESCRIPTION ===
${input.prDescription}

=== PR DIFF ===
${input.prDiff}

=== TEST SUMMARY ===
${input.testSummary}

=== ARTIFACT URLS ===
${artifactSection}

Produce your review as a GitHub PR comment. Structure:
- One paragraph summary (what the PR claims vs. what it delivers).
- Acceptance-criteria checklist: for each box in the issue, state whether it's covered by the diff + a test. Cite file paths.
- Hard-rule audit: any violations? Cite CLAUDE.md / AGENT-BRIEFING.md rule numbers.
- Concerns or follow-ups.

End your comment with EXACTLY one of these three lines (nothing after it):
  VERDICT: APPROVE
  VERDICT: REQUEST_CHANGES
  VERDICT: BLOCK

Use APPROVE only when every acceptance box is satisfied, tests are green, and the
artifacts demonstrate the feature works. Use REQUEST_CHANGES for fixable gaps
(missing test, minor taxonomy drift, missing screenshots/artifacts, harness
failures). Use BLOCK only when the PR represents a fundamentally wrong direction
or a product/visual ambiguity and a human must intervene.

When you use BLOCK for visual or product ambiguity, include a short "Human
decision packet" before the verdict with:
- Reason: the ambiguity that needs a human call.
- Options: at least two concrete choices the human can pick from.
- Artifacts: screenshots, preview links, PR comments, or other evidence links.

If the artifacts needed for a product/visual call are missing, use
REQUEST_CHANGES instead and ask the author agent to capture them.`;
}
