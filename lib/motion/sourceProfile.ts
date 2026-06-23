import type { ProjectFacts } from '@/lib/research/repo-facts';
import type {
  AppProfile,
  MotionClaimReceipt,
  MotionProjectKind,
  MotionProvenanceRef,
  MotionSourceCaptureCandidate,
  MotionSourceProfile,
  MotionSourceProfileKind,
  MotionSourceSignal,
  MotionSourceStoryboardHint,
} from './project';

export interface BuildRepoMotionSourceProfileInput {
  kind: Extract<MotionSourceProfileKind, 'local-repo' | 'github-repo'>;
  sourceRef: string;
  appProfile: AppProfile;
  facts: ProjectFacts;
  claims: MotionClaimReceipt[];
  projectKind: MotionProjectKind;
}

export function buildRepoMotionSourceProfile(
  input: BuildRepoMotionSourceProfileInput
): MotionSourceProfile {
  const source: MotionProvenanceRef = { kind: 'repo', ref: input.sourceRef };
  const signals = buildSignals(input, source);
  const captureCandidates = buildCaptureCandidates(input, source);
  const storyboardHints = buildStoryboardHints(input, captureCandidates, source);

  return {
    kind: input.kind,
    label: `${input.appProfile.name} source material`,
    sourceRef: input.sourceRef,
    summary: sourceProfileSummary(input, captureCandidates),
    signals,
    captureCandidates,
    storyboardHints,
    provenance: [source],
  };
}

function buildSignals(
  input: BuildRepoMotionSourceProfileInput,
  source: MotionProvenanceRef
): MotionSourceSignal[] {
  const signals: MotionSourceSignal[] = [];
  const stack = uniqueStrings([...input.appProfile.stack, ...input.facts.readmeHighlights]);
  const packageScripts = input.facts.packageScripts ?? [];
  const appRoutes = input.facts.appRoutes ?? [];

  if (stack.length > 0) {
    signals.push({
      id: 'signal-stack',
      label: 'Stack',
      value: stack.slice(0, 6).join(', '),
      provenance: [source],
    });
  }

  if (typeof input.facts.sourceFileCount === 'number') {
    signals.push({
      id: 'signal-source-files',
      label: 'Source files',
      value: `${input.facts.sourceFileCount}`,
      provenance: [source],
    });
  }

  if (packageScripts.length > 0) {
    signals.push({
      id: 'signal-scripts',
      label: 'Scripts',
      value: packageScripts.slice(0, 5).join(', '),
      provenance: [{ kind: 'repo', ref: packageJsonRef(input.sourceRef) }],
    });
  }

  if (appRoutes.length > 0) {
    signals.push({
      id: 'signal-routes',
      label: 'Routes',
      value: appRoutes.slice(0, 5).join(', '),
      provenance: [source],
    });
  }

  if (input.claims.length > 0) {
    signals.push({
      id: 'signal-claims',
      label: 'Receipts',
      value: `${input.claims.length} grounded claim${input.claims.length === 1 ? '' : 's'}`,
      provenance: input.claims.map((claim) => claim.source),
    });
  }

  return signals;
}

function buildCaptureCandidates(
  input: BuildRepoMotionSourceProfileInput,
  source: MotionProvenanceRef
): MotionSourceCaptureCandidate[] {
  const candidates: MotionSourceCaptureCandidate[] = [];
  const routes = input.facts.appRoutes ?? [];
  const firstRoute = routes[0] ?? '/';
  const homepageUrl = input.appProfile.siteUrl ?? input.facts.homepageUrl;

  if (homepageUrl) {
    candidates.push(
      {
        id: 'capture-hosted-still',
        label: `Capture ${input.appProfile.name} homepage`,
        mode: 'screenshot',
        targetKind: 'url',
        targetRef: homepageUrl,
        reason: 'Hosted site is available as product evidence.',
        provenance: [{ kind: 'site', ref: homepageUrl }],
      },
      {
        id: 'record-hosted-flow',
        label: `Record ${input.appProfile.name} product flow`,
        mode: 'screen-recording',
        targetKind: 'url',
        targetRef: homepageUrl,
        reason: 'Demo scenes need a product flow, not generic motion filler.',
        provenance: [{ kind: 'site', ref: homepageUrl }],
      }
    );
  }

  const localBaseUrl = localPreviewBaseUrl(input.facts);
  if (input.kind === 'local-repo' && localBaseUrl) {
    const targetRef = joinUrlPath(localBaseUrl, firstRoute);
    candidates.push(
      {
        id: 'capture-local-app-still',
        label: `Capture local app route ${firstRoute}`,
        mode: 'screenshot',
        targetKind: 'local-app',
        targetRef,
        setup: setupCommand(input.facts),
        setupCwd: input.sourceRef,
        reason: 'Local repo exposes an app route suitable for a product still.',
        provenance: [source],
      },
      {
        id: 'capture-local-dom',
        label: `Read local app structure ${firstRoute}`,
        mode: 'dom-snapshot',
        targetKind: 'local-app',
        targetRef,
        setup: setupCommand(input.facts),
        setupCwd: input.sourceRef,
        reason: 'DOM structure helps captions and component regeneration stay grounded.',
        provenance: [source],
      },
      {
        id: 'record-local-flow',
        label: `Record local product flow ${firstRoute}`,
        mode: 'screen-recording',
        targetKind: 'local-app',
        targetRef,
        setup: setupCommand(input.facts),
        setupCwd: input.sourceRef,
        reason: 'Launch and feature videos need at least one real product insert.',
        provenance: [source],
      }
    );
  }

  if (candidates.length === 0) {
    candidates.push({
      id: 'add-product-capture-source',
      label: 'Add app URL or running local app',
      mode: 'screenshot',
      targetKind: input.kind === 'local-repo' ? 'local-app' : 'url',
      reason: 'Repo facts can script the video, but product scenes still need visual material.',
      provenance: [source],
    });
  }

  return dedupeCandidates(candidates);
}

function buildStoryboardHints(
  input: BuildRepoMotionSourceProfileInput,
  captureCandidates: MotionSourceCaptureCandidate[],
  source: MotionProvenanceRef
): MotionSourceStoryboardHint[] {
  const firstClaim = input.claims[0];
  const productCapture = captureCandidates.find((candidate) => Boolean(candidate.targetRef));

  return [
    {
      id: 'hint-hook-from-summary',
      beatRole: 'hook',
      label: input.appProfile.summary,
      reason: 'Use the product summary as the opening claim.',
      provenance: [source],
    },
    ...(firstClaim
      ? [
          {
            id: 'hint-proof-from-claim',
            beatRole: 'proof' as const,
            label: firstClaim.text,
            reason: 'Use a grounded repo claim as the proof scene.',
            provenance: [firstClaim.source],
          },
        ]
      : []),
    ...(productCapture
      ? [
          {
            id: 'hint-demo-from-capture',
            beatRole: 'demo' as const,
            label: productCapture.label,
            reason: 'Use a real capture target for the demo scene.',
            provenance: productCapture.provenance,
          },
        ]
      : []),
  ];
}

function sourceProfileSummary(
  input: BuildRepoMotionSourceProfileInput,
  captureCandidates: MotionSourceCaptureCandidate[]
): string {
  const routeCount = input.facts.appRoutes?.length ?? 0;
  const readyCaptures = captureCandidates.filter((candidate) => candidate.targetRef).length;
  const sourceLabel = input.kind === 'local-repo' ? 'local repo' : 'GitHub repo';

  if (readyCaptures > 0 && routeCount > 0) {
    return `${sourceLabel} with ${routeCount} app route${routeCount === 1 ? '' : 's'} and ${readyCaptures} capture candidate${readyCaptures === 1 ? '' : 's'}`;
  }

  if (readyCaptures > 0) {
    return `${sourceLabel} with ${readyCaptures} capture candidate${readyCaptures === 1 ? '' : 's'}`;
  }

  return `${sourceLabel} facts are ready; add a product visual source for demo scenes`;
}

function localPreviewBaseUrl(facts: ProjectFacts): string | null {
  const dependencies = new Set(
    (facts.dependencyNames ?? []).map((dependency) => dependency.toLowerCase())
  );
  const scripts = new Set(facts.packageScripts ?? []);

  if (!scripts.has('dev') && !scripts.has('start')) return null;
  if (dependencies.has('vite')) return 'http://localhost:5173';
  if (dependencies.has('next')) return 'http://localhost:3000';
  return 'http://localhost:3000';
}

function setupCommand(facts: ProjectFacts): string | undefined {
  const scripts = new Set(facts.packageScripts ?? []);
  if (scripts.has('dev')) return 'npm run dev';
  if (scripts.has('start')) return 'npm start';
  return undefined;
}

function joinUrlPath(baseUrl: string, route: string): string {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${baseUrl}${normalizedRoute === '/' ? '/' : normalizedRoute}`;
}

function packageJsonRef(sourceRef: string): string {
  return `${sourceRef.replace(/\/$/, '')}/package.json`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function dedupeCandidates(
  candidates: MotionSourceCaptureCandidate[]
): MotionSourceCaptureCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.mode}:${candidate.targetKind}:${candidate.targetRef ?? candidate.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
