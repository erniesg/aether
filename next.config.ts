import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

function loadLocalDevVars() {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.AETHER_DEV_VARS_LOADED === '1') return;

  const filePath = join(process.cwd(), '.dev.vars');
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }

  process.env.AETHER_DEV_VARS_LOADED = '1';
}

loadLocalDevVars();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This repo is often checked out beside other aether worktrees under a
  // parent directory that also has a lockfile. Pin the project root so Next
  // serves dev chunks from this app instead of inferring the parent workspace.
  outputFileTracingRoot: process.cwd(),
  // Hide the Next.js floating `N` dev indicator — it occludes the composer's
  // reference-image thumbs and adds noise on a creative surface.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
