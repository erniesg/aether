import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeScript = readFileSync(
  resolve(process.cwd(), '.github/scripts/route-review-verdict.mjs'),
  'utf8'
);

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/claude-review.yml'),
  'utf8'
);

describe('route-review-verdict harness contract', () => {
  it('re-dispatches routine REQUEST_CHANGES without a Discord notification', () => {
    const branch = routeScript.match(
      /if \(verdict === 'REQUEST_CHANGES'\) \{([\s\S]*?)\n  if \(verdict === 'BLOCK'\)/
    )?.[1];

    expect(branch).toBeTruthy();
    expect(branch).toMatch(/redispatchIssue\(\s*issueTarget/);
    expect(branch).toContain('buildRedispatchHandoff');
    expect(branch).toContain('REQUEST_CHANGES re-dispatched without Discord notification');
    expect(branch).not.toContain('reviewer REQUESTED_CHANGES');
    expect(branch).not.toContain('sendDiscordEmbed');
  });

  it('treats missing reviewer verdicts as automation repair when a source issue exists', () => {
    const branch = routeScript.match(
      /\/\/ No verdict: this is a harness\/reviewer failure[\s\S]*?\n}/
    )?.[0];

    expect(branch).toBeTruthy();
    expect(branch).toMatch(/redispatchIssue\(\s*issueTarget/);
    expect(branch).toContain('buildRedispatchHandoff');
    expect(branch).toContain('missing verdict re-dispatched without Discord notification');
    expect(branch).toContain('routeUnrecoverableHuman');
  });

  it('posts issue handoff context before refreshing claude-run', () => {
    expect(routeScript).toContain('function buildRedispatchHandoff');
    expect(routeScript).toContain('### Automated reviewer handoff');
    expect(routeScript).toContain("gh(['issue', 'comment'");
    expect(routeScript).toContain('The router is refreshing `claude-run`');
  });

  it('requires a decision packet before sending BLOCK to a human', () => {
    expect(routeScript).toContain('humanReview: normalizeHumanReview');
    expect(routeScript).toContain('function hasHumanDecisionPacket');
    expect(routeScript).toContain("humanReview?.kind === 'visual'");
    expect(routeScript).toContain("humanReview?.kind === 'product'");
    expect(routeScript).toContain('humanReview.options.length < 2');
    expect(routeScript).toContain('BLOCK lacked a complete human decision packet');
    expect(routeScript).toContain('buildHumanDecisionFields(commonFields, activeReview.humanReview)');
  });

  it('adds clickable human-choice buttons to complete BLOCK decision packets', () => {
    expect(routeScript).toContain("const HUMAN_CHOICE_PREFIX = 'human_choice'");
    expect(routeScript).toContain('function buildHumanChoiceRows');
    expect(routeScript).toContain('custom_id: `${HUMAN_CHOICE_PREFIX}_${prNumber}_${index + 1}`');
    expect(routeScript).toContain('components: buildHumanChoiceRows(pr.url, pr.number, activeReview.humanReview)');
  });
});

describe('auto-merge for safe PRs', () => {
  it('declares an auto-merge path safelist (docs/tests/configs/lockfile/generated)', () => {
    expect(routeScript).toContain('AUTO_MERGE_SAFELIST');
    expect(routeScript).toMatch(/\/\^docs\\\//);
    expect(routeScript).toMatch(/\/\^tests\\\//);
    expect(routeScript).toMatch(/\/\^\\\.github\\\//);
    expect(routeScript).toMatch(/\/\^package-lock\\\.json\$/);
    expect(routeScript).toMatch(/\/\^convex\\\/_generated\\\//);
  });

  it('honors the auto-merge-safe label as a fast path', () => {
    expect(routeScript).toContain("'auto-merge-safe'");
    expect(routeScript).toContain('isPrSafeForAutoMerge');
  });

  it('auto-merges in the APPROVE branch when safe and notifies Discord with auto-merged copy', () => {
    const branch = routeScript.match(
      /if \(verdict === 'APPROVE'\) \{([\s\S]*?)\n    addLabels\(prTarget, \['ready-for-ernie'\]\);/
    )?.[1];
    expect(branch).toBeTruthy();
    expect(branch).toContain('isPrSafeForAutoMerge(pr.number, pr.labels)');
    expect(branch).toContain('mergePr(pr.number)');
    expect(branch).toContain('aether · auto-merged ·');
    expect(branch).toContain('extractEvidenceFields');
  });

  it('embeds reviewer acceptance + validation evidence on the manual-ack APPROVE ping', () => {
    expect(routeScript).toContain('extractEvidenceFields');
    expect(routeScript).toMatch(/acceptance[^\n]*\\n/i);
    expect(routeScript).toMatch(/validation[^\n]*\\n/i);
  });
});

describe('claude-review structured output contract', () => {
  it('asks reviewer blocks to include options and artifacts for visual/product ambiguity', () => {
    expect(workflow).toContain('humanReview');
    expect(workflow).toContain('artifactUrls');
    expect(workflow).toContain('options');
    expect(workflow).toContain('For visual/product ambiguity');
    expect(workflow).toContain('return REQUEST_CHANGES asking the author');
  });

  it('keeps fixable reviewer feedback inside the automated loop', () => {
    expect(workflow).toContain('REQUEST_CHANGES: fixable code, test, artifact-capture, or harness');
    expect(workflow).toContain('author agent will be re-dispatched automatically');
    expect(workflow).toContain('Do not use BLOCK just because a screenshot/artifact is missing');
  });

  it('grounds the reviewer in the rubric + personas + parent issue QA plan', () => {
    // The reviewer agent should not improvise. Make sure the prompt
    // names the three load-bearing inputs and tells the agent to fetch
    // the parent issue's `## QA Plan` section.
    expect(workflow).toContain('docs/qa-rubric.md');
    expect(workflow).toContain('docs/reviewer-personas.md');
    expect(workflow).toContain('## QA Plan');
    expect(workflow).toContain('Closes #N');
    expect(workflow).toContain('gh issue view');
  });

  it('routes personas by touched paths and merges their verdicts', () => {
    expect(workflow).toContain('auto-routing table');
    expect(workflow).toContain('correctness');
    expect(workflow).toContain('demo-arc');
    expect(workflow).toContain('provenance');
    expect(workflow).toContain('ux-restraint');
    expect(workflow).toContain('security-cost');
    expect(workflow).toContain('BLOCK > REQUEST_CHANGES > APPROVE');
  });

  it('rejects unfalsifiable phrasing with REQUEST_CHANGES (no escape hatch)', () => {
    expect(workflow).toContain('banned phrasing');
    expect(workflow).toMatch(/\bshould\b/);
    expect(workflow).toContain('looks good');
    expect(workflow).toContain('No "skip with justification."');
  });

  it('declares an optional personas[] schema with the five enumerated risk surfaces', () => {
    expect(workflow).toContain('"personas"');
    expect(workflow).toContain('"correctness"');
    expect(workflow).toContain('"demo-arc"');
    expect(workflow).toContain('"provenance"');
    expect(workflow).toContain('"ux-restraint"');
    expect(workflow).toContain('"security-cost"');
    expect(workflow).toContain('"PASS"');
    expect(workflow).toContain('"FAIL"');
    expect(workflow).toContain('"UNVERIFIABLE"');
  });
});

describe('route-verdict persona enrichment', () => {
  it('parses a personas[] array off the structured output and normalizes assertions', () => {
    expect(routeScript).toContain('function normalizePersonas');
    expect(routeScript).toContain('PERSONA_IDS');
    expect(routeScript).toContain('ASSERTION_STATUSES');
    expect(routeScript).toContain('personas: normalizePersonas(parsed.personas)');
  });

  it('surfaces UNVERIFIABLE-without-proof as a blocking artifact request', () => {
    expect(routeScript).toContain('function unverifiableWithoutProof');
    expect(routeScript).toContain('Unverifiable assertions — proof required before merge');
    expect(routeScript).toContain('formatUnverifiableBlock');
  });

  it('renders a per-persona verdict table in the PR comment', () => {
    expect(routeScript).toContain('function formatPersonaTable');
    expect(routeScript).toContain('### Persona verdicts');
    expect(routeScript).toContain('| Persona | Verdict | Assertions |');
  });

  it('keeps personas[] additive — the merged verdict still drives routing', () => {
    // Sanity-check: the persona functions should not introduce a new
    // top-level verdict path. The existing verdict-driven routing is
    // unchanged; personas[] is for richer reporting only.
    expect(routeScript).toContain("if (verdict === 'APPROVE')");
    expect(routeScript).toContain("if (verdict === 'REQUEST_CHANGES')");
    expect(routeScript).toContain("if (verdict === 'BLOCK')");
  });
});
