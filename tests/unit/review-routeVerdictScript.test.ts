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
});
