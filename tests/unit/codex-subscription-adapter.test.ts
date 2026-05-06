import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const adapterPath = resolve(process.cwd(), 'scripts/codex-subscription-adapter.mjs');
const issueContextPath = resolve(process.cwd(), 'scripts/codex-issue-context.mjs');
const codexApplyPatchPath = resolve(process.cwd(), 'scripts/codex-apply-patch.mjs');
const preflightPath = resolve(process.cwd(), 'scripts/codex-subscription-preflight.mjs');
const adapterSource = readFileSync(adapterPath, 'utf8');
const issueContextSource = readFileSync(issueContextPath, 'utf8');
const codexApplyPatchSource = readFileSync(codexApplyPatchPath, 'utf8');
const preflightSource = readFileSync(preflightPath, 'utf8');
const codexWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/codex.yml'), 'utf8');
const preflightWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/codex-subscription-preflight.yml'),
  'utf8'
);

function jwtWithClaims(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

describe('Codex subscription adapter', () => {
  it('pins the subscription-backed Codex endpoints and client metadata', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);

    expect(adapter.CODEX_CLIENT_ID).toBe('app_EMoamEEZ73f0CkXaXp7hrann');
    expect(adapter.CODEX_DEVICE_USERCODE_URL).toBe(
      'https://auth.openai.com/api/accounts/deviceauth/usercode'
    );
    expect(adapter.CODEX_DEVICE_TOKEN_URL).toBe(
      'https://auth.openai.com/api/accounts/deviceauth/token'
    );
    expect(adapter.CODEX_DEVICE_VERIFY_URL).toBe('https://auth.openai.com/codex/device');
    expect(adapter.CODEX_OAUTH_TOKEN_URL).toBe('https://auth.openai.com/oauth/token');
    expect(adapter.CODEX_RESPONSES_URL).toBe(
      'https://chatgpt.com/backend-api/codex/responses'
    );
  });

  it('builds the custom device-code flow payloads', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);

    expect(adapter.buildDeviceCodeRequestBody()).toEqual({
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    });
    expect(
      adapter.buildDeviceTokenPollBody({
        deviceAuthId: 'dev_auth_123',
        userCode: 'ABCD-EFGH',
      })
    ).toEqual({
      device_auth_id: 'dev_auth_123',
      user_code: 'ABCD-EFGH',
    });
    expect(
      adapter.buildTokenExchangeBody({
        authorizationCode: 'auth_code',
        codeVerifier: 'verifier',
      }).toString()
    ).toContain('redirect_uri=https%3A%2F%2Fauth.openai.com%2Fdeviceauth%2Fcallback');
  });

  it('extracts ChatGPT account ids from explicit ChatGPT JWT claim locations', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);

    expect(
      adapter.extractChatGptAccountId(jwtWithClaims({ chatgpt_account_id: 'acct_direct' }))
    ).toBe('acct_direct');
    expect(
      adapter.extractChatGptAccountId(
        jwtWithClaims({
          'https://api.openai.com/auth': { chatgpt_account_id: 'acct_nested' },
        })
      )
    ).toBe('acct_nested');
    expect(
      adapter.extractChatGptAccountId(jwtWithClaims({ organizations: [{ id: 'org_fallback' }] }))
    ).toBe('');
  });

  it('normalizes native and CodeGraff credential shapes', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);
    const expiresAt = '2026-05-06T12:00:00.000Z';
    const codeGraffCredential = [
      {
        id: 'codex',
        auth_details: {
          oauth: {
            tokens: {
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              expires_at: expiresAt,
            },
            config: {
              client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
            },
          },
        },
        url_params: {
          chatgpt_account_id: 'acct_from_codegraff',
        },
      },
    ];

    expect(adapter.normalizeCredential(codeGraffCredential)).toMatchObject({
      provider: 'codex',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt,
      chatgptAccountId: 'acct_from_codegraff',
      responseUrl: 'https://chatgpt.com/backend-api/codex/responses',
    });
  });

  it('does not trust credential-controlled response URLs', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);

    expect(
      adapter.normalizeCredential({
        accessToken: 'access-token',
        responseUrl: 'https://attacker.example/responses',
      }).responseUrl
    ).toBe('https://chatgpt.com/backend-api/codex/responses');
  });

  it('knows when local credentials need refresh', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);
    const now = new Date('2026-05-06T04:00:00.000Z');

    expect(
      adapter.credentialNeedsRefresh(
        {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-05-06T04:03:00.000Z',
        },
        now
      )
    ).toBe(true);
    expect(
      adapter.credentialNeedsRefresh(
        {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-05-06T05:00:00.000Z',
        },
        now
      )
    ).toBe(false);
  });

  it('builds Codex response headers without API-key auth', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);

    expect(
      adapter.buildCodexHeaders(
        {
          accessToken: 'access-token',
          chatgptAccountId: 'acct_123',
        },
        { conversationId: 'conv_123' }
      )
    ).toMatchObject({
      Authorization: 'Bearer access-token',
      'ChatGPT-Account-Id': 'acct_123',
      originator: 'forge',
      'x-client-request-id': 'conv_123',
      session_id: 'conv_123',
    });
  });

  it('builds the Codex Responses payload with the required backend transform', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);
    const request = adapter.buildCodexResponsesRequest({
      prompt: 'Fix the failing test.',
      instructions: 'Stay local-only.',
      reasoningEffort: 'high',
      serviceTier: 'priority',
    });

    expect(request).toMatchObject({
      model: 'gpt-5.3-codex',
      stream: true,
      store: false,
      include: ['reasoning.encrypted_content'],
      reasoning: {
        effort: 'high',
        summary: 'auto',
      },
      instructions: 'Stay local-only.',
      service_tier: 'priority',
    });
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('max_output_tokens');
  });

  it('parses direct Codex SSE deltas', async () => {
    const adapter = await import(pathToFileURL(adapterPath).href);
    const events = adapter.parseSseEvents(
      [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"hello"}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":" world"}',
        '',
      ].join('\n')
    );

    expect(events.map(adapter.extractTextDeltaFromSseEvent).join('')).toBe('hello world');
  });

  it('keeps live subscription calls out of GitHub Actions', () => {
    expect(adapterSource).toContain('Refusing live network call');
    expect(adapterSource).toContain('Live commands require --live');
    expect(codexWorkflow).not.toContain('codex-subscription-adapter.mjs');
    expect(codexWorkflow).not.toContain('CODEGRAFF_CODEX_CREDENTIALS_B64');
    expect(codexWorkflow).not.toContain('OPENAI_CODEX_OAUTH_CREDENTIALS_B64');
    expect(codexWorkflow).not.toContain('OPENAI_CODEX_OAUTH_TOKEN');
    expect(codexWorkflow).not.toMatch(/secrets\.[A-Z0-9_]*CODEX[A-Z0-9_]*/);
    expect(codexWorkflow).not.toMatch(/secrets\.[A-Z0-9_]*GRAFF[A-Z0-9_]*/);
    expect(codexWorkflow).not.toContain('chatgpt.com/backend-api/codex/responses');
  });

  it('keeps the GitHub preflight workflow on a self-hosted non-authoring boundary', () => {
    expect(preflightWorkflow).toContain('runs-on: [self-hosted, codex-subscription]');
    expect(preflightWorkflow).toContain('codex:subscription:preflight');
    expect(preflightWorkflow).not.toContain('codex-subscription-adapter.mjs request');
    expect(preflightWorkflow).not.toContain(' --live');
    expect(preflightWorkflow).not.toMatch(/secrets\.[A-Z0-9_]*CODEX[A-Z0-9_]*/);
    expect(preflightWorkflow).not.toMatch(/secrets\.[A-Z0-9_]*GRAFF[A-Z0-9_]*/);
    expect(preflightWorkflow).not.toContain('chatgpt.com/backend-api/codex/responses');
  });

  it('preflight reports readiness without live Codex calls', async () => {
    const preflight = await import(pathToFileURL(preflightPath).href);
    const report = preflight.buildPreflightReport({
      credentialPath: '/tmp/aether-missing-codex-subscription.json',
      env: {
        GITHUB_ACTIONS: 'true',
        RUNNER_ENVIRONMENT: 'self-hosted',
        RUNNER_NAME: 'codex-runner',
        RUNNER_OS: 'macOS',
      },
    });

    expect(report.liveNetworkCalls).toBe(false);
    expect(report.runner.runnerEnvironment).toBe('self-hosted');
    expect(report.credential.exists).toBe(false);
    expect(preflightSource).not.toContain('requestCodexText');
    expect(preflightSource).not.toContain('startDeviceAuthorization');
  });

  it('builds issue context bundles without invoking Codex or mutating GitHub', async () => {
    const issueContext = await import(pathToFileURL(issueContextPath).href);
    const bundle = issueContext.buildIssueContextBundle({
      generatedAt: '2026-05-06T00:00:00.000Z',
      issue: {
        number: 144,
        title: 'Build Codex adapter',
        url: 'https://github.com/erniesg/aether/issues/144',
        state: 'OPEN',
        author: { login: 'erniesg' },
        labels: [{ name: 'codex-run' }],
        body: 'Wire the adapter.',
        comments: [{ author: { login: 'erniesg' }, body: 'Keep it local first.' }],
      },
      contextFiles: [{ path: 'AGENTS.md', exists: true, content: 'canvas-first' }],
      trackedFiles: ['AGENTS.md', 'scripts/codex-subscription-adapter.mjs'],
    });

    expect(bundle).toContain('Build Codex adapter');
    expect(bundle).toContain('Keep it local first.');
    expect(bundle).toContain('canvas-first');
    expect(bundle).toContain('It does not invoke Codex');
    expect(issueContextSource).not.toContain('requestCodexText');
    expect(issueContextSource).not.toContain('git push');
    expect(issueContextSource).not.toContain('pr create');
  });

  it('keeps Codex patch application as a local relay instead of a remote authoring bridge', async () => {
    const patchRelay = await import(pathToFileURL(codexApplyPatchPath).href);
    const diff = patchRelay.extractUnifiedDiff(`
Use this patch:

\`\`\`diff
diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new
\`\`\`
`);

    expect(diff).toContain('diff --git a/README.md b/README.md');
    expect(diff.trim().endsWith('+new')).toBe(true);
    expect(patchRelay.extractPatchPaths(diff)).toEqual(['README.md']);
    expect(
      patchRelay.branchForIssue({
        number: 144,
        title: 'Build Codex adapter',
      })
    ).toBe('codex/issue-144-build-codex-adapter');
    expect(patchRelay.runVerification('skip')).toEqual({
      ok: true,
      output: 'verification skipped',
    });
    expect(patchRelay.runVerification('npm run typecheck')).toMatchObject({ ok: false });
    expect(
      patchRelay.buildVerificationEnv({
        PATH: '/usr/bin',
        HOME: '/tmp/home',
        OPENAI_API_KEY: 'secret',
        GH_TOKEN: 'secret',
      })
    ).toEqual({
      PATH: '/usr/bin',
      HOME: '/tmp/home',
    });
    expect(codexApplyPatchSource).not.toContain("git(['add', '-A'])");
    expect(codexApplyPatchSource).not.toContain("git(['checkout', '-B'");
    expect(codexApplyPatchSource).not.toContain('requestCodexText');
    expect(codexApplyPatchSource).not.toContain('CODEX_RESPONSES_URL');
    expect(codexApplyPatchSource).not.toContain('chatgpt.com/backend-api/codex/responses');
  });
});
