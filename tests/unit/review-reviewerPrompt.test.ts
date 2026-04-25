import { describe, expect, it } from 'vitest';
import { buildReviewerPrompt } from '@/lib/review/reviewerPrompt';
import { parseVerdict } from '@/lib/review/parseVerdict';

// Mocked contract test: the reviewer prompt must carry all the fields the
// reviewer needs and end-to-end plausibly produce a parseable verdict. We
// simulate Claude's response rather than actually calling the API so this
// runs in CI without credentials.

const FIXTURE_ISSUE = `## What
Add a signals CRUD route.

## Red/green acceptance
- [ ] API route responds to GET /api/signals
- [ ] Zod schema validates POST payload
- [ ] Convex mutation writes to \`signals\` table
`;

const FIXTURE_DIFF = `diff --git a/app/api/signals/route.ts b/app/api/signals/route.ts
new file mode 100644
--- /dev/null
+++ b/app/api/signals/route.ts
@@ -0,0 +1,12 @@
+import { NextResponse } from 'next/server';
+export async function GET() {
+  return NextResponse.json({ ok: true });
+}
`;

const FIXTURE_TEST_SUMMARY = '12 passed / 0 failed / 87% coverage';

describe('buildReviewerPrompt', () => {
  it('includes diff, issue body, test summary, and artifact URLs in the prompt', () => {
    const prompt = buildReviewerPrompt({
      prNumber: 123,
      prTitle: 'feat(signals): crud route',
      prDescription: 'Implements #25.',
      prDiff: FIXTURE_DIFF,
      issueNumber: 25,
      issueTitle: 'Signals CRUD',
      issueBody: FIXTURE_ISSUE,
      testSummary: FIXTURE_TEST_SUMMARY,
      artifactUrls: ['https://r2.example.com/artifacts/pr-123/home.png'],
    });

    expect(prompt).toContain('FRESH CONTEXT');
    expect(prompt).toContain('#25');
    expect(prompt).toContain('#123');
    expect(prompt).toContain('API route responds to GET');
    expect(prompt).toContain('diff --git');
    expect(prompt).toContain('12 passed / 0 failed');
    expect(prompt).toContain('r2.example.com/artifacts/pr-123/home.png');
  });

  it('instructs the reviewer to emit exactly one of the three verdict strings', () => {
    const prompt = buildReviewerPrompt({
      prNumber: 1,
      prTitle: 't',
      prDescription: '',
      prDiff: '',
      issueNumber: 1,
      issueTitle: 't',
      issueBody: '',
      testSummary: '',
      artifactUrls: [],
    });

    expect(prompt).toContain('VERDICT: APPROVE');
    expect(prompt).toContain('VERDICT: REQUEST_CHANGES');
    expect(prompt).toContain('VERDICT: BLOCK');
  });

  it('flags the no-artifacts case so reviewer penalizes UI PRs without screenshots', () => {
    const prompt = buildReviewerPrompt({
      prNumber: 1,
      prTitle: 't',
      prDescription: '',
      prDiff: '',
      issueNumber: 1,
      issueTitle: 't',
      issueBody: '',
      testSummary: '',
      artifactUrls: [],
    });

    expect(prompt).toContain('no artifacts captured');
  });

  it('requires artifact-backed options before blocking for visual/product ambiguity', () => {
    const prompt = buildReviewerPrompt({
      prNumber: 1,
      prTitle: 't',
      prDescription: '',
      prDiff: '',
      issueNumber: 1,
      issueTitle: 't',
      issueBody: '',
      testSummary: '',
      artifactUrls: ['https://r2.example.com/artifacts/pr-1/canvas.png'],
    });

    expect(prompt).toContain('decision packet');
    expect(prompt).toContain('Reason:');
    expect(prompt).toContain('Options: at least two concrete choices');
    expect(prompt).toContain('Artifacts: screenshots');
    expect(prompt).toContain('If the artifacts needed for a product/visual call are missing');
    expect(prompt).toContain('REQUEST_CHANGES instead');
  });

  it('defaults to strict rubric; opts in to lenient only when strict === false', () => {
    const strict = buildReviewerPrompt({
      prNumber: 1,
      prTitle: 't',
      prDescription: '',
      prDiff: '',
      issueNumber: 1,
      issueTitle: 't',
      issueBody: '',
      testSummary: '',
      artifactUrls: [],
    });
    expect(strict).toContain('Grade strictly');

    const lenient = buildReviewerPrompt({
      prNumber: 1,
      prTitle: 't',
      prDescription: '',
      prDiff: '',
      issueNumber: 1,
      issueTitle: 't',
      issueBody: '',
      testSummary: '',
      artifactUrls: [],
      strict: false,
    });
    expect(lenient).toContain('Grade generously');
  });
});

describe('reviewer-prompt → verdict contract (simulated)', () => {
  // These tests simulate Claude's response to the prompt. They confirm the
  // prompt output + parser form a closed loop. Live Claude-API integration is
  // skipped here because CI doesn't have credentials; a live smoke test
  // belongs in a post-merge workflow.

  function simulateApprovalResponse(): string {
    return [
      'Reviewed the diff: `app/api/signals/route.ts` adds the GET route.',
      '',
      '- [x] GET route — covered by the new handler.',
      '- [x] Zod schema — covered.',
      '- [x] Convex mutation — covered.',
      '',
      'No hard-rule violations.',
      '',
      'VERDICT: APPROVE',
    ].join('\n');
  }

  function simulateRequestChangesResponse(): string {
    return [
      'GET route is implemented but Zod schema is missing.',
      '',
      'VERDICT: REQUEST_CHANGES',
    ].join('\n');
  }

  function simulateBlockResponse(): string {
    return [
      'The PR adds a wizard route under /app/signals/new/ — violates hard rule #1 (single synthesis-shell).',
      '',
      'VERDICT: BLOCK',
    ].join('\n');
  }

  it('approve → parseVerdict extracts APPROVE', () => {
    expect(parseVerdict(simulateApprovalResponse())).toBe('APPROVE');
  });

  it('request changes → parseVerdict extracts REQUEST_CHANGES', () => {
    expect(parseVerdict(simulateRequestChangesResponse())).toBe('REQUEST_CHANGES');
  });

  it('block → parseVerdict extracts BLOCK', () => {
    expect(parseVerdict(simulateBlockResponse())).toBe('BLOCK');
  });
});
