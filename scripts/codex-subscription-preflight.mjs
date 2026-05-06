#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  CODEX_CLIENT_ID,
  CODEX_DEVICE_TOKEN_URL,
  CODEX_DEVICE_USERCODE_URL,
  CODEX_DEVICE_VERIFY_URL,
  CODEX_OAUTH_TOKEN_URL,
  CODEX_RESPONSES_URL,
  credentialNeedsRefresh,
  defaultCredentialPath,
  normalizeCredential,
} from './codex-subscription-adapter.mjs';

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

function inspectCredential(path) {
  if (!existsSync(path)) {
    return {
      exists: false,
      provider: 'codex',
      hasAccessToken: false,
      hasRefreshToken: false,
      hasChatGptAccountId: false,
      needsRefresh: null,
    };
  }
  let credential;
  try {
    credential = normalizeCredential(JSON.parse(readFileSync(path, 'utf8')), {
      requireAccessToken: false,
    });
  } catch (error) {
    return {
      exists: true,
      provider: 'codex',
      hasAccessToken: false,
      hasRefreshToken: false,
      hasChatGptAccountId: false,
      needsRefresh: null,
      parseError: error?.message || String(error),
    };
  }
  return {
    exists: true,
    provider: credential.provider,
    clientId: credential.clientId,
    hasAccessToken: Boolean(credential.accessToken),
    hasRefreshToken: Boolean(credential.refreshToken),
    hasChatGptAccountId: Boolean(credential.chatgptAccountId),
    needsRefresh: credentialNeedsRefresh(credential),
    expiresAt: credential.expiresAt || '',
    responseUrlPinned: credential.responseUrl === CODEX_RESPONSES_URL,
  };
}

function inspectRunner(env = process.env) {
  return {
    githubActions: env.GITHUB_ACTIONS === 'true',
    runnerName: env.RUNNER_NAME || '',
    runnerOs: env.RUNNER_OS || process.platform,
    runnerEnvironment: env.RUNNER_ENVIRONMENT || '',
    workspace: env.GITHUB_WORKSPACE || process.cwd(),
  };
}

function inspectWorkflowBoundary() {
  const workflowPath = resolve('.github/workflows/codex.yml');
  if (!existsSync(workflowPath)) {
    return {
      codexWorkflowExists: false,
      restoresSubscriptionSecrets: false,
      invokesRemoteCodex: false,
    };
  }
  const workflow = readFileSync(workflowPath, 'utf8');
  return {
    codexWorkflowExists: true,
    restoresSubscriptionSecrets:
      /secrets\.[A-Z0-9_]*CODEX[A-Z0-9_]*/.test(workflow) ||
      /secrets\.[A-Z0-9_]*GRAFF[A-Z0-9_]*/.test(workflow) ||
      workflow.includes('OPENAI_CODEX_OAUTH_TOKEN') ||
      workflow.includes('CODEGRAFF_CODEX_CREDENTIALS_B64') ||
      workflow.includes('OPENAI_CODEX_OAUTH_CREDENTIALS_B64'),
    invokesRemoteCodex: workflow.includes(CODEX_RESPONSES_URL),
  };
}

export function buildPreflightReport({ credentialPath, env = process.env } = {}) {
  const path = resolve(credentialPath || defaultCredentialPath(env));
  return {
    ok: true,
    kind: 'codex-subscription-preflight',
    liveNetworkCalls: false,
    credentialPath: path,
    endpoints: {
      clientId: CODEX_CLIENT_ID,
      deviceUsercodeUrl: CODEX_DEVICE_USERCODE_URL,
      deviceTokenUrl: CODEX_DEVICE_TOKEN_URL,
      deviceVerifyUrl: CODEX_DEVICE_VERIFY_URL,
      oauthTokenUrl: CODEX_OAUTH_TOKEN_URL,
      responsesUrl: CODEX_RESPONSES_URL,
    },
    runner: inspectRunner(env),
    credential: inspectCredential(path),
    workflowBoundary: inspectWorkflowBoundary(),
  };
}

function validatePreflight(report, args) {
  const failures = [];
  if (asBoolean(args.selfHostedOnly) && report.runner.githubActions) {
    if (report.runner.runnerEnvironment === 'github-hosted') {
      failures.push('Refusing Codex subscription preflight on a GitHub-hosted runner.');
    }
    if (!report.runner.runnerName && !report.runner.runnerEnvironment) {
      failures.push('Runner identity is missing; expected a self-hosted codex-subscription runner.');
    }
  }
  if (asBoolean(args.requireCredential) && !report.credential.exists) {
    failures.push(`Codex subscription credential not found at ${report.credentialPath}.`);
  }
  if (report.credential.exists && !report.credential.hasAccessToken) {
    failures.push('Codex subscription credential is missing an access token.');
  }
  if (report.credential.parseError) {
    failures.push(`Codex subscription credential could not be parsed: ${report.credential.parseError}`);
  }
  if (report.credential.exists && !report.credential.responseUrlPinned) {
    failures.push('Codex subscription response URL is not pinned to the expected endpoint.');
  }
  if (report.workflowBoundary.restoresSubscriptionSecrets) {
    failures.push('codex.yml restores Codex/Graff subscription secrets from GitHub Actions.');
  }
  if (report.workflowBoundary.invokesRemoteCodex) {
    failures.push('codex.yml invokes the ChatGPT Codex endpoint from GitHub Actions.');
  }
  return failures;
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('Codex subscription preflight');
  console.log(`- live network calls: ${report.liveNetworkCalls}`);
  console.log(`- credential path: ${report.credentialPath}`);
  console.log(`- credential exists: ${report.credential.exists}`);
  console.log(`- has access token: ${report.credential.hasAccessToken}`);
  console.log(`- has refresh token: ${report.credential.hasRefreshToken}`);
  console.log(`- has ChatGPT account id: ${report.credential.hasChatGptAccountId}`);
  console.log(`- needs refresh: ${report.credential.needsRefresh}`);
  console.log(`- runner: ${report.runner.runnerName || '(local)'} ${report.runner.runnerEnvironment}`);
  console.log(`- workflow restores subscription secrets: ${report.workflowBoundary.restoresSubscriptionSecrets}`);
  console.log(`- workflow invokes remote Codex: ${report.workflowBoundary.invokesRemoteCodex}`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = buildPreflightReport({ credentialPath: args.credentialPath });
  const failures = validatePreflight(report, args);
  report.ok = failures.length === 0;
  report.failures = failures;
  printReport(report, asBoolean(args.json));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`::error::${failure}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
