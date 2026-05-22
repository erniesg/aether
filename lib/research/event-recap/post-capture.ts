import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { getEventBundle } from './store';
import type { EventPlatform, EventPost } from './types';

export type EventPostCaptureProvider = 'local-playwright';
export type EventPostCaptureStatus = 'captured' | 'page-captured' | 'blocked' | 'failed';

export interface EventPostCaptureTarget {
  eventId: string;
  platform: EventPlatform;
  url: string;
  postId?: string;
  authorName?: string;
  authorHandle?: string;
  reachScore?: number;
}

export interface EventPostCapture {
  eventId: string;
  runId: string;
  provider: EventPostCaptureProvider;
  status: EventPostCaptureStatus;
  platform: EventPlatform;
  url: string;
  finalUrl?: string;
  postId?: string;
  authorName?: string;
  authorHandle?: string;
  capturedAt: number;
  screenshotPath?: string;
  screenshotRelPath?: string;
  screenshotBytes?: number;
  screenshotSha256?: string;
  viewport: { width: number; height: number };
  elementSelector?: string;
  blockedReason?: string;
  warnings: string[];
  error?: string;
  bodyExcerpt?: string;
  resumed?: boolean;
}

export interface EventPostCaptureRun {
  eventId: string;
  runId: string;
  provider: EventPostCaptureProvider;
  targetCount: number;
  capturedCount: number;
  resumedCount: number;
  pageCapturedCount: number;
  blockedCount: number;
  failedCount: number;
  outputDir: string;
  manifestPath: string;
  captures: EventPostCapture[];
  startedAt: number;
  finishedAt: number;
}

export interface SelectCaptureTargetsInput {
  eventId: string;
  posts: EventPost[];
  platforms?: EventPlatform[];
  urls?: string[];
  all?: boolean;
  limit?: number;
  perPlatform?: number;
  includeIrrelevant?: boolean;
}

export interface CaptureEventPostScreenshotsInput {
  eventId: string;
  platforms?: EventPlatform[];
  urls?: string[];
  all?: boolean;
  limit?: number;
  perPlatform?: number;
  resume?: boolean;
  includeLinkedInComments?: boolean;
  includeIrrelevant?: boolean;
  provider?: EventPostCaptureProvider;
  outputRoot?: string;
  runId?: string;
  headless?: boolean;
  timeoutMs?: number;
  waitAfterLoadMs?: number;
  concurrency?: number;
  storageStatePath?: string;
  userDataDir?: string;
  viewport?: { width?: number; height?: number };
  onProgress?: (progress: {
    completed: number;
    total: number;
    capture: EventPostCapture;
  }) => void;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 1600 };
const SUPPORTED_CAPTURE_PLATFORMS: EventPlatform[] = ['x', 'linkedin'];

export async function captureEventPostScreenshots(
  input: CaptureEventPostScreenshotsInput
): Promise<EventPostCaptureRun> {
  const provider = input.provider ?? 'local-playwright';
  if (provider !== 'local-playwright') {
    throw new Error(`unsupported event post capture provider: ${provider}`);
  }

  const bundle = await getEventBundle(input.eventId);
  if (!bundle) throw new Error(`event ${input.eventId} not found`);

  const targets = selectCaptureTargets({
    eventId: input.eventId,
    posts: bundle.posts,
    platforms: input.platforms,
    urls: input.urls,
    all: input.all,
    limit: input.limit,
    perPlatform: input.perPlatform,
    includeIrrelevant: input.includeIrrelevant,
  });
  if (!targets.length) throw new Error(`no X or LinkedIn posts matched event ${input.eventId}`);

  const runId = input.runId ?? `post_capture_${Date.now()}`;
  const outputDir = path.resolve(
    input.outputRoot ?? process.cwd(),
    'outputs',
    `event-recap-${input.eventId}`,
    'captures',
    runId
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const startedAt = Date.now();
  const captures = await captureTargetsWithLocalPlaywright(targets, {
    ...input,
    outputDir,
    runId,
    viewport: normalizedViewport(input.viewport),
  });
  const manifestPath = path.join(outputDir, 'manifest.json');
  const finishedAt = Date.now();
  const run: EventPostCaptureRun = {
    eventId: input.eventId,
    runId,
    provider,
    targetCount: targets.length,
    capturedCount: captures.filter((capture) => capture.status === 'captured').length,
    resumedCount: captures.filter((capture) => capture.resumed).length,
    pageCapturedCount: captures.filter((capture) => capture.status === 'page-captured').length,
    blockedCount: captures.filter((capture) => capture.status === 'blocked').length,
    failedCount: captures.filter((capture) => capture.status === 'failed').length,
    outputDir,
    manifestPath,
    captures,
    startedAt,
    finishedAt,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

export function selectCaptureTargets(input: SelectCaptureTargetsInput): EventPostCaptureTarget[] {
  const platformSet = new Set(
    (input.platforms?.length ? input.platforms : SUPPORTED_CAPTURE_PLATFORMS).filter(isSupportedCapturePlatform)
  );
  const byUrl = new Map(input.posts.map((post) => [postUrlKey(post.url), post]));

  if (input.urls?.length) {
    const seen = new Set<string>();
    return input.urls.flatMap((url) => {
      const key = postUrlKey(url);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      const post = byUrl.get(key);
      const platform = post?.platform ?? inferPostPlatform(url);
      if (!platform || !platformSet.has(platform)) return [];
      return [captureTargetFromPostLike(input.eventId, platform, url, post)];
    });
  }

  const candidates = input.posts
    .filter((post) => platformSet.has(post.platform))
    .filter((post) => input.includeIrrelevant || !post.tags.includes('irrelevant:event'))
    .sort((a, b) => b.reachScore - a.reachScore);

  if (!input.all && input.perPlatform && Number.isFinite(input.perPlatform)) {
    const perPlatform = Math.max(1, Math.round(input.perPlatform));
    const grouped = new Map<EventPlatform, EventPost[]>();
    for (const post of candidates) {
      grouped.set(post.platform, [...(grouped.get(post.platform) ?? []), post]);
    }
    return SUPPORTED_CAPTURE_PLATFORMS.flatMap((platform) =>
      (grouped.get(platform) ?? []).slice(0, perPlatform)
    ).map((post) => captureTargetFromPostLike(input.eventId, post.platform, post.url, post));
  }

  const limit = input.all
    ? candidates.length
    : input.limit && Number.isFinite(input.limit)
      ? Math.max(1, Math.round(input.limit))
      : 20;
  return candidates
    .slice(0, limit)
    .map((post) => captureTargetFromPostLike(input.eventId, post.platform, post.url, post));
}

export function classifyCaptureAccess(
  platform: EventPlatform,
  finalUrl: string | undefined,
  bodyText: string
): { blockedReason?: string; warnings: string[] } {
  const lower = `${finalUrl ?? ''}\n${bodyText}`.toLowerCase();
  const warnings: string[] = [];

  if (/(captcha|challenge|checkpoint|verify your identity|security verification|two-factor|2fa)/i.test(lower)) {
    return { blockedReason: 'verification checkpoint', warnings };
  }

  if (platform === 'linkedin') {
    if (/\/login|authwall|signup|join linkedin|sign in to linkedin|email or phone|password/.test(lower)) {
      return { blockedReason: 'linkedin login wall', warnings };
    }
    if (/this profile is not available|content is unavailable/.test(lower)) {
      return { blockedReason: 'linkedin content unavailable', warnings };
    }
  }

  if (platform === 'x') {
    if (/sign in to x|log in to x|don.t miss what.s happening|create your account/.test(lower)) {
      warnings.push('X showed logged-out chrome; post card may still be visible.');
    }
    if (/something went wrong|try reloading|rate limit exceeded/.test(lower)) {
      return { blockedReason: 'x render failed or rate limited', warnings };
    }
  }

  return { warnings };
}

export function resolveCaptureStatus(input: {
  hasPostElement: boolean;
  blockedReason?: string;
}): { status: EventPostCaptureStatus; blockedReason?: string } {
  if (input.hasPostElement) return { status: 'captured' };
  if (input.blockedReason) {
    return { status: 'blocked', blockedReason: input.blockedReason };
  }
  return { status: 'page-captured' };
}

function captureTargetFromPostLike(
  eventId: string,
  platform: EventPlatform,
  url: string,
  post?: EventPost
): EventPostCaptureTarget {
  return {
    eventId,
    platform,
    url: post?.url ?? url,
    postId: post?.postId,
    authorName: post?.authorName,
    authorHandle: post?.authorHandle,
    reachScore: post?.reachScore,
  };
}

function isSupportedCapturePlatform(platform: EventPlatform): boolean {
  return platform === 'x' || platform === 'linkedin';
}

function inferPostPlatform(url: string): EventPlatform | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('x.com') || host.endsWith('twitter.com')) return 'x';
    if (host.endsWith('linkedin.com')) return 'linkedin';
    if (host.endsWith('youtube.com') || host.endsWith('youtu.be')) return 'youtube';
    return null;
  } catch {
    return null;
  }
}

function postUrlKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().toLowerCase();
  } catch {
    return url.trim().split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  }
}

async function captureTargetsWithLocalPlaywright(
  targets: EventPostCaptureTarget[],
  input: CaptureEventPostScreenshotsInput & {
    outputDir: string;
    runId: string;
    viewport: { width: number; height: number };
  }
): Promise<EventPostCapture[]> {
  const { chromium } = await import('@playwright/test');
  const opened = await openLocalBrowserContext(chromium, input);
  try {
    const captures: EventPostCapture[] = new Array(targets.length);
    let nextIndex = 0;
    let completed = 0;
    const workerCount = Math.min(targets.length, clampNumber(input.concurrency, 1, 6, 3));
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= targets.length) return;
          const capture = await captureSingleTarget(opened.context, targets[index], input);
          captures[index] = capture;
          completed += 1;
          input.onProgress?.({ completed, total: targets.length, capture });
        }
      })
    );
    return captures;
  } finally {
    await opened.close();
  }
}

async function openLocalBrowserContext(
  chromium: typeof import('@playwright/test').chromium,
  input: CaptureEventPostScreenshotsInput & { viewport: { width: number; height: number } }
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const headless = input.headless ?? process.env.EVENT_CAPTURE_HEADLESS !== '0';
  const userDataDir = input.userDataDir ?? process.env.EVENT_CAPTURE_USER_DATA_DIR;
  const storageStatePath = input.storageStatePath ?? process.env.EVENT_CAPTURE_STORAGE_STATE;
  const common = {
    headless,
    viewport: input.viewport,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  if (userDataDir) {
    const context = await chromium.launchPersistentContext(userDataDir, common);
    return { context, close: () => context.close() };
  }

  const browser: Browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: input.viewport,
    locale: common.locale,
    userAgent: common.userAgent,
    ...(storageStatePath && fs.existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
  });
  return { context, close: () => browser.close() };
}

async function captureSingleTarget(
  context: BrowserContext,
  target: EventPostCaptureTarget,
  input: CaptureEventPostScreenshotsInput & {
    outputDir: string;
    runId: string;
    viewport: { width: number; height: number };
  }
): Promise<EventPostCapture> {
  const page = await context.newPage();
  const capturedAt = Date.now();
  const screenshotPath = path.join(input.outputDir, captureFileName(target));
  const base: Omit<EventPostCapture, 'status' | 'warnings'> = {
    eventId: target.eventId,
    runId: input.runId,
    provider: 'local-playwright',
    platform: target.platform,
    url: target.url,
    postId: target.postId,
    authorName: target.authorName,
    authorHandle: target.authorHandle,
    capturedAt,
    viewport: input.viewport,
  };

  if (input.resume && fs.existsSync(screenshotPath)) {
    const screenshot = screenshotMeta(screenshotPath);
    return {
      ...base,
      status: 'captured',
      screenshotPath,
      screenshotRelPath: path.relative(process.cwd(), screenshotPath),
      screenshotBytes: screenshot.bytes,
      screenshotSha256: screenshot.sha256,
      warnings: ['resumed from existing screenshot'],
      resumed: true,
    };
  }

  try {
    await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: clampMs(input.timeoutMs, 5000, 60000, 25000),
    });
    await dismissKnownBanners(page);
    await page.waitForTimeout(clampMs(input.waitAfterLoadMs, 500, 8000, 2500));
    await dismissKnownBanners(page);

    const element = await findPostElement(page, target.platform);
    const bodyExcerpt = await readBodyExcerpt(page);
    const access = classifyCaptureAccess(target.platform, page.url(), bodyExcerpt);

    const clip = element ? await captureClip(target.platform, element.locator, input).catch(() => null) : null;
    if (clip) {
      await page.screenshot({ path: screenshotPath, clip });
    } else if (element) {
      await element.locator.screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    const screenshot = screenshotMeta(screenshotPath);
    const relPath = path.relative(process.cwd(), screenshotPath);
    const resolved = resolveCaptureStatus({
      hasPostElement: Boolean(element),
      blockedReason: access.blockedReason,
    });
    const warnings = [
      ...access.warnings,
      ...(access.blockedReason && element
        ? [`Captured post card while page also reported: ${access.blockedReason}`]
        : []),
    ];
    return {
      ...base,
      status: resolved.status,
      finalUrl: page.url(),
      screenshotPath,
      screenshotRelPath: relPath,
      screenshotBytes: screenshot.bytes,
      screenshotSha256: screenshot.sha256,
      elementSelector: element?.selector,
      blockedReason: resolved.blockedReason,
      warnings,
      bodyExcerpt,
    };
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      finalUrl: page.url(),
      warnings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function captureClip(
  platform: EventPlatform,
  locator: Locator,
  input: CaptureEventPostScreenshotsInput
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  if (platform !== 'linkedin') return null;
  if (input.includeLinkedInComments !== false) return null;
  return linkedinPostOnlyClip(locator);
}

async function linkedinPostOnlyClip(
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return await locator.evaluate((root) => {
    const article = root as HTMLElement;
    const articleBox = article.getBoundingClientRect();
    const visibleElements = Array.from(article.querySelectorAll<HTMLElement>('*')).filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const boundaryTops: number[] = [];
    for (const element of visibleElements) {
      const box = element.getBoundingClientRect();
      const className = String(element.getAttribute('class') ?? '');
      const text = (element.innerText ?? '').replace(/\s+/g, ' ').trim();
      if (
        /\bcomment\b/i.test(className) ||
        /\bTo view or add a comment\b/i.test(text) ||
        /\bSee more comments\b/i.test(text)
      ) {
        if (box.top > articleBox.top + 120) boundaryTops.push(box.top);
      }
    }
    const boundaryTop = boundaryTops.length ? Math.min(...boundaryTops) : undefined;
    if (!boundaryTop) return null;
    const height = Math.max(180, Math.round(boundaryTop - articleBox.top - 6));
    if (height >= articleBox.height - 12) return null;
    return {
      x: Math.max(0, Math.round(articleBox.left + window.scrollX)),
      y: Math.max(0, Math.round(articleBox.top + window.scrollY)),
      width: Math.max(1, Math.round(articleBox.width)),
      height,
    };
  });
}

async function dismissKnownBanners(page: Page): Promise<void> {
  const buttonNames = [
    /^accept all cookies$/i,
    /^accept cookies$/i,
    /^allow all cookies$/i,
    /^reject non-essential$/i,
    /^got it$/i,
    /^close$/i,
    /^dismiss$/i,
    /^not now$/i,
  ];
  for (const name of buttonNames) {
    await page.getByRole('button', { name }).first().click({ timeout: 800 }).catch(() => undefined);
  }
}

async function findPostElement(
  page: Page,
  platform: EventPlatform
): Promise<{ locator: Locator; selector: string } | null> {
  const selectors =
    platform === 'x'
      ? ['article[data-testid="tweet"]', '[data-testid="tweet"]']
      : [
          '[aria-label^="Feed post"]',
          '[aria-label*="Feed post"]',
          '[data-view-name="feed-full-update"]',
          '[data-view-name="feed-shared-update-v2"]',
          '[data-urn*="urn:li:activity"]',
          '[data-id*="urn:li:activity"]',
          '.feed-shared-update-v2',
          '.fie-impression-container',
          '.update-components-card',
          'article',
        ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 3500 }).catch(() => undefined);
    if (!(await locator.count().catch(() => 0))) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    const box = await locator.boundingBox().catch(() => null);
    if (!box || box.width < 240 || box.height < 120) continue;
    return { locator, selector };
  }
  return null;
}

async function readBodyExcerpt(page: Page): Promise<string> {
  const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 1400);
}

function screenshotMeta(filePath: string): { bytes: number; sha256: string } {
  const buffer = fs.readFileSync(filePath);
  return {
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function captureFileName(target: EventPostCaptureTarget): string {
  const author = target.authorHandle ?? target.authorName ?? 'post';
  const slug = slugPart(author);
  const hash = crypto.createHash('sha256').update(target.url).digest('hex').slice(0, 12);
  return `${target.platform}-${slug}-${hash}.png`;
}

function slugPart(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'post';
}

function normalizedViewport(value?: { width?: number; height?: number }): { width: number; height: number } {
  return {
    width: clampNumber(value?.width, 800, 2200, DEFAULT_VIEWPORT.width),
    height: clampNumber(value?.height, 900, 2600, DEFAULT_VIEWPORT.height),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampMs(value: unknown, min: number, max: number, fallback: number): number {
  return clampNumber(value, min, max, fallback);
}
