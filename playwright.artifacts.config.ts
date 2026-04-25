import { defineConfig, devices } from '@playwright/test';

// Separate Playwright config for reviewer-agent artifact capture (issue #55).
//
// The main `playwright.config.ts` targets `tests/e2e/` and is what
// `npm run test:e2e` executes. Artifact capture runs against a deployed
// preview URL (no webServer), captures screenshots, and uploads to R2 — a
// different lifecycle, so it gets its own config.
//
// Usage:
//   AETHER_BASE_URL=https://pr-123.aether-stg.berlayar.ai \
//     npm run test:artifacts
//
// Outputs land in PLAYWRIGHT_ARTIFACT_DIR (default `artifacts/`).

const BASE_URL = process.env.AETHER_BASE_URL;
const PORT = process.env.PORT ?? '3000';

export default defineConfig({
  testDir: './tests/artifacts',
  fullyParallel: false, // sequential for deterministic screenshot ordering
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // If AETHER_BASE_URL is unset, boot the local dev server (useful for
  // authoring new artifact specs). In CI this is always set by the workflow.
  webServer: BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
