#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { isPublicWriteAllowed } from '../.github/scripts/local-codex-intake.mjs';

const DEFAULT_VERIFY_COMMAND = 'typecheck';
const SAFE_VERIFY_COMMANDS = new Map([
  ['typecheck', { command: 'node_modules/.bin/tsc', args: ['--noEmit'] }],
]);
const SAFE_ENV_KEYS = new Set([
  'CI',
  'HOME',
  'LOGNAME',
  'NODE_ENV',
  'PATH',
  'SHELL',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USER',
]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function asBoolean(value) {
  return value === true || value === 'true' || value === '1';
}

function truncate(value, limit = 16_000) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]`;
}

function buildVerificationEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => SAFE_ENV_KEYS.has(key))
  );
}

function run(command, args, { allowFailure = false, env = process.env } = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? '';
    const stderr = error.stderr?.toString?.() ?? '';
    const output = `${stdout}${stderr}`.trim();
    if (allowFailure) return output;
    throw new Error(`${command} ${args.join(' ')} failed\n${truncate(output)}`);
  }
}

function commandSucceeds(command, args, { env = process.env } = {}) {
  try {
    execFileSync(command, args, {
      stdio: 'ignore',
      env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

function runShell(command) {
  try {
    const output = execFileSync('/bin/sh', ['-lc', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildVerificationEnv(),
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, output: output.trim() };
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? '';
    const stderr = error.stderr?.toString?.() ?? '';
    return { ok: false, output: truncate(`${stdout}${stderr}`.trim()) };
  }
}

function git(args, options) {
  return run('git', args, options);
}

function gitSucceeds(args) {
  return commandSucceeds('git', args);
}

function gh(args, options) {
  return run('gh', args, options);
}

function parseJson(raw, fallback) {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value ?? 'work')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || 'work';
}

function resolveIssueNumber(args, env = process.env) {
  const issueNumber = args.issueNumber || env.ISSUE_NUMBER || '';
  if (!issueNumber) throw new Error('Issue number required. Pass --issue-number or set ISSUE_NUMBER.');
  return String(issueNumber);
}

function loadIssue(issueNumber) {
  return parseJson(
    gh(['issue', 'view', issueNumber, '--json', 'number,title,url'], { allowFailure: true }),
    { number: Number(issueNumber), title: `Codex patch for issue #${issueNumber}` }
  );
}

function branchForIssue(issue, explicitBranch) {
  return explicitBranch || `codex/issue-${issue.number}-${slugify(issue.title)}`;
}

function checkoutBranch(branch, base = 'origin/main') {
  git(['fetch', 'origin', '--quiet']);
  if (gitSucceeds(['rev-parse', '--verify', '--quiet', branch])) {
    git(['checkout', branch]);
    return;
  }
  if (gitSucceeds(['rev-parse', '--verify', '--quiet', `origin/${branch}`])) {
    git(['checkout', '-b', branch, `origin/${branch}`]);
    return;
  }
  git(['checkout', '-b', branch, base]);
}

function extractUnifiedDiff(raw) {
  const text = String(raw ?? '');
  const fenced = text.match(/```(?:diff|patch)?\s*\n([\s\S]*?)```/i);
  const body = fenced?.[1] ?? text;
  const diffIndex = body.indexOf('diff --git ');
  if (diffIndex >= 0) return `${body.slice(diffIndex).trim()}\n`;
  const plainIndex = body.search(/^---\s+/m);
  if (plainIndex >= 0) return `${body.slice(plainIndex).trim()}\n`;
  throw new Error('Patch file did not contain a unified diff.');
}

function tokenizeDiffGitLine(line) {
  const tokens = [];
  let index = 'diff --git '.length;
  while (tokens.length < 2 && index < line.length) {
    while (line[index] === ' ') index += 1;
    if (line[index] === '"') {
      let token = '"';
      index += 1;
      while (index < line.length) {
        const chr = line[index];
        token += chr;
        index += 1;
        if (chr === '"' && token[token.length - 2] !== '\\') break;
      }
      tokens.push(token);
      continue;
    }
    const start = index;
    while (index < line.length && line[index] !== ' ') index += 1;
    if (start < index) tokens.push(line.slice(start, index));
  }
  return tokens;
}

function normalizePatchPath(rawPath) {
  let patchPath = String(rawPath ?? '').trim();
  if (!patchPath) return '';
  if (patchPath.startsWith('"') && patchPath.endsWith('"')) {
    try {
      patchPath = JSON.parse(patchPath);
    } catch {
      patchPath = patchPath.slice(1, -1);
    }
  }
  patchPath = patchPath.split('\t')[0].replace(/^[ab]\//, '');
  if (!patchPath || patchPath === '/dev/null') return '';
  if (patchPath.startsWith('/') || patchPath.startsWith('../') || patchPath.includes('\0')) {
    throw new Error(`Unsafe patch path: ${patchPath}`);
  }
  return patchPath;
}

function extractPatchPaths(diff) {
  const paths = new Set();
  for (const line of String(diff ?? '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      for (const token of tokenizeDiffGitLine(line)) {
        const patchPath = normalizePatchPath(token);
        if (patchPath) paths.add(patchPath);
      }
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const patchPath = normalizePatchPath(line.slice(4));
      if (patchPath) paths.add(patchPath);
    }
  }
  return [...paths];
}

function applyPatch(patchFile) {
  const rawPatch = readFileSync(resolve(patchFile), 'utf8');
  const diff = extractUnifiedDiff(rawPatch);
  const paths = extractPatchPaths(diff);
  if (paths.length === 0) throw new Error('Patch did not contain any file paths to stage.');
  const normalizedPath = join(tmpdir(), `aether-codex-incoming-${process.pid}.patch`);
  writeFileSync(normalizedPath, diff, 'utf8');
  git(['apply', '--check', normalizedPath]);
  git(['apply', '--whitespace=fix', normalizedPath]);
  return paths;
}

function configureGitIdentity() {
  git(['config', 'user.name', 'aether-codex[bot]']);
  git(['config', 'user.email', 'aether-codex[bot]@users.noreply.github.com']);
}

function hasChanges() {
  return Boolean(git(['status', '--porcelain'], { allowFailure: true }).trim());
}

function ensureCleanWorktree() {
  const status = git(['status', '--porcelain'], { allowFailure: true });
  if (!status.trim()) return;
  throw new Error(`Working tree must be clean before applying a Codex patch.\n${truncate(status)}`);
}

function runDirectVerification(command, args) {
  try {
    return {
      ok: true,
      output: run(command, args, { env: buildVerificationEnv() }),
    };
  } catch (error) {
    return { ok: false, output: truncate(error?.message || error) };
  }
}

function runVerification(command, { allowShell = false } = {}) {
  const normalized = command || DEFAULT_VERIFY_COMMAND;
  if (normalized === 'skip') return { ok: true, output: 'verification skipped' };
  const safeCommand = SAFE_VERIFY_COMMANDS.get(normalized);
  if (safeCommand) return runDirectVerification(safeCommand.command, safeCommand.args);
  if (!allowShell) {
    return {
      ok: false,
      output: `Unsupported verification command: ${normalized}. Use one of ${[
        ...SAFE_VERIFY_COMMANDS.keys(),
        'skip',
      ].join(', ')} or pass --allow-shell-verification for a sanitized shell command.`,
    };
  }
  return runShell(command);
}

function stagePatchPaths(paths) {
  git(['add', '--', ...paths]);
}

function commitPatch(issue, verification) {
  if (!hasChanges()) throw new Error('Patch applied cleanly but produced no working tree changes.');
  const suffix = verification.ok ? '' : ' (verification failing)';
  git(['commit', '-m', `codex: apply issue #${issue.number} patch${suffix}`]);
}

function publicWritesAllowed(env = process.env) {
  return isPublicWriteAllowed(env.AETHER_PUBLIC_WRITE_POLICY || 'after-hours-sgt');
}

function ensurePublicWritesAllowed() {
  if (!publicWritesAllowed()) {
    throw new Error('Public GitHub writes are paused by AETHER_PUBLIC_WRITE_POLICY.');
  }
}

function pushBranch(branch) {
  ensurePublicWritesAllowed();
  git(['push', '--set-upstream', 'origin', branch]);
}

function openPr({ issue, branch, verification, draft }) {
  ensurePublicWritesAllowed();
  const existing = parseJson(
    gh(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url'], { allowFailure: true }),
    []
  )[0];
  if (existing?.url) {
    console.log(existing.url);
    return;
  }
  const body = [
    `Applied a Codex-produced patch for #${issue.number}.`,
    '',
    `Verification: ${verification.ok ? 'passed' : 'failed'}`,
    verification.output ? `\n\`\`\`\n${truncate(verification.output, 6000)}\n\`\`\`` : '',
    '',
    `Closes #${issue.number}.`,
  ].join('\n');
  const args = [
    'pr',
    'create',
    '--title',
    issue.title,
    '--body',
    body,
    '--base',
    'main',
    '--head',
    branch,
  ];
  if (draft || !verification.ok) args.splice(2, 0, '--draft');
  console.log(gh(args));
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.patchFile) throw new Error('Patch file required. Pass --patch-file <path>.');
  const issueNumber = resolveIssueNumber(args);
  const issue = loadIssue(issueNumber);
  const branch = branchForIssue(issue, args.branch);
  const testCommand = args.testCommand || DEFAULT_VERIFY_COMMAND;

  configureGitIdentity();
  if (!asBoolean(args.noCheckout)) checkoutBranch(branch, args.base || 'origin/main');
  ensureCleanWorktree();
  const paths = applyPatch(args.patchFile);
  stagePatchPaths(paths);
  const verification = runVerification(testCommand, {
    allowShell: asBoolean(args.allowShellVerification),
  });
  commitPatch(issue, verification);

  if (asBoolean(args.push)) pushBranch(branch);
  if (asBoolean(args.createPr)) {
    openPr({
      issue,
      branch,
      verification,
      draft: asBoolean(args.draft),
    });
  } else {
    console.log(`Committed patch on ${branch}. Re-run with --push --create-pr when ready.`);
  }

  if (!verification.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}

export {
  extractUnifiedDiff,
  extractPatchPaths,
  branchForIssue,
  buildVerificationEnv,
  runVerification,
};
