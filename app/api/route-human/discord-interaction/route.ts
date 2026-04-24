import { NextResponse } from 'next/server';
import { GithubClient } from '@/lib/route-human/github';
import { handleInteraction } from '@/lib/route-human/interaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNATURE_HEADER = 'x-signature-ed25519';
const TIMESTAMP_HEADER = 'x-signature-timestamp';

function missingConfig(): NextResponse | null {
  const missing: string[] = [];
  if (!process.env.DISCORD_PUBLIC_KEY) missing.push('DISCORD_PUBLIC_KEY');
  if (!process.env.GITHUB_MERGE_TOKEN && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    missing.push('GITHUB_MERGE_TOKEN (or CLAUDE_CODE_OAUTH_TOKEN)');
  }
  if (!process.env.GITHUB_REPOSITORY) missing.push('GITHUB_REPOSITORY');
  if (missing.length === 0) return null;
  return NextResponse.json(
    { ok: false, error: `route-human misconfigured: missing ${missing.join(', ')}` },
    { status: 500 }
  );
}

export async function POST(request: Request): Promise<Response> {
  const configError = missingConfig();
  if (configError) return configError;

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);

  const github = new GithubClient({
    token: (process.env.GITHUB_MERGE_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN)!,
    repo: process.env.GITHUB_REPOSITORY!,
  });

  const result = await handleInteraction(
    {
      rawBody,
      signature,
      timestamp,
      publicKey: process.env.DISCORD_PUBLIC_KEY!,
    },
    { github }
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.json, { status: 200 });
}

export async function GET(): Promise<Response> {
  // Lightweight configuration probe — handy for ops to confirm env wiring
  // without sending a real signed interaction.
  return NextResponse.json({
    ok: true,
    service: 'route-human/discord-interaction',
    configured: {
      publicKey: Boolean(process.env.DISCORD_PUBLIC_KEY),
      githubToken: Boolean(
        process.env.GITHUB_MERGE_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN
      ),
      repo: Boolean(process.env.GITHUB_REPOSITORY),
    },
  });
}
