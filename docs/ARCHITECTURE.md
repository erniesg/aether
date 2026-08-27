# Architecture

This document describes aether's durable boundaries. Source files remain authoritative for fast-changing schemas, provider lists, and deployment settings.

## System shape

```text
creator
  |
  v
Next.js workspace shell
  |- compact input rails
  |- tldraw canvas and lenses
  |- scoped bottom composer
  |- focused output and metadata surfaces
  |
  +--> Next.js API routes --> capability and provider registries
  |                              |- image and video
  |                              |- reference and research
  |                              |- segmentation and spatial
  |                              `- publishing
  |
  `--> Convex
         |- canonical workspace graph
         |- reactive queries and mutations
         |- server actions and run records
         `- file storage

OpenNext packages the Next.js application for Cloudflare Workers. Cloudflare
bindings provide deployment assets and the R2 buckets used by flows that need
object storage.
```

The creator workspace is one synthesis shell at `/workspace/[wsId]`. Research, generation, inspection, and export may use lenses or disclosed supporting views, but they must not split the creator loop into a wizard or an operator dashboard.

## State and ownership boundary

Architecture claims use four states:

- **Current:** behavior observed in executable code on the repository default.
- **Documented target:** accepted design intent, not an implementation claim.
- **Implemented but unreleased:** code and exact-head evidence exist, but no external release is proven.
- **Released:** an exact deployment or submitted artifact and target-specific acceptance evidence are recorded.

At the current head, Aether is a creator-workspace prototype with Convex state and run records. `POST /api/export` produces one PNG per supplied artboard plus the prototype `manifest.json` in a ZIP. The client skips an artboard whose completed PNG cannot be resolved, so its current export can be partial. Current research and provider paths also retain their source-defined unavailable-provider and deterministic development fallbacks. Aether currently has no Struct import or exact package pin, `CreativeGraph`, printer profile or preflight, PDF proof renderer, authenticated immutable import receipt, or durable target derivative release manifest. The existing `asset`, `exportPack`, workspace, `manifest.json`, and PNG-ZIP types remain prototype-only unless a later migration names and proves them explicitly.

The upstream owner-first target covers born-digital academic PDF/DOCX acquisition, private reconstruction, review/edit/approve, `/research/:slug`, deterministic XHTML, and accessible reflowable EPUB. Scans and unsupported structures fail closed to `needs-manual-reconstruction`; no OCR-quality promise is made. Struct's `StructBundle`, public bytes decoder/verifier, publication, and consumer migration remain documented targets rather than current exports from its private `0.0.0` package.

The cross-repository ownership boundary is one-way:

| Concern | Owner | Aether boundary |
|---|---|---|
| PDF/DOCX/source acquisition, reconstruction, source-specific recovery wording | Ernie.SG | Never imported as Aether internals |
| Editorial decisions, canonical revisions, approval, authenticated export/release records, public delivery | Ernie.SG | Aether consumes only an authenticated approved export |
| Semantic schema, stable IDs, integrity, recovery facts, bundle verification, deterministic XHTML/reflowable EPUB | Struct | Future exact-pinned public bytes-decoder boundary only |
| Visual composition, explicit visual overrides, print/social/motion derivatives, profiles, preflight, derivative manifests | Aether | References verified stable IDs; owns no canonical text |
| Generic orchestration, policy, and evidence collection | Rucksack | May invoke target-owned commands; has no domain, content, credential, or mutation authority |

Aether must not copy, mutate, or silently fork canonical Struct text. A `CreativeGraph` is a downstream projection that references stable block and asset IDs and owns visual choices only. Missing or changed upstream references fail closed. A semantic correction returns to Ernie.SG and arrives only as a newly approved, authenticated, and verified revision.

## Documented downstream target

Aether is optional and is not required for the first Ernie.SG and Struct publication MVP. Its fixed owner-first proof is one image-led A5, 24-page, saddle-stitched booklet with cover, one printer-accepted PDF, and three linked social cutdowns. The real printer, versioned PDF/X and ICC requirements, font/bleed/resolution/imposition/binding acceptance profile, and production renderer remain open.

The target import and composition path is inactive and ordered:

```text
authenticated actor/session/workspace import authorization
  -> size-cap and hash the unparsed serialized bundle
  -> authenticate and freshness-check the Ernie.SG producer record
  -> exact-pinned Struct bytes decoder with expected bundle digest
  -> atomically persist canonical bundle bytes and content-addressed assets
  -> immutable import metadata and Aether import receipt
  -> stable-ID references
  -> CreativeGraph
  -> renderer/profile
  -> preflight
  -> complete derivative manifest
```

Struct integrity verification is not producer authentication. Before parsing or resolver execution, the target must bind the raw bundle digest to a current authenticated Ernie.SG producer record, approved revision, producer trust, audience/target, status/supersession policy, and replay/idempotency policy. Forged, absent, stale, revoked, superseded, replayed, wrong-audience, or mismatched evidence fails with zero resolver starts. Editable composition becomes reachable only after authenticated import, atomic content-addressed persistence, immutable pinning, and actor/workspace authorization complete.

The inactive authorization contract grants import, read, edit, release, and asset access separately. Unauthorized and cross-workspace reads, writes, imports, ID enumeration, and direct Convex/API mutations fail before domain or storage access.

The target derivative manifest is separate from the prototype export manifest. It binds the authenticated import and upstream revision, `CreativeGraph`, renderer and versioned profile, supplied printer and preflight rules/results, approval, the booklet and three social artifacts, lineage among them, and every artifact digest.

## External-action gates

`A-REQ` and `A-ACT` are inactive and fail closed. Neither documentation, prior planning approval, a branch, nor a passing test activates them. Each future receipt requires newly authenticated immutable explicit-user authorization, an immutable authorization ID and evidence SHA-256, and bindings for the exact canonical action, target, execution actor, issue time, expiry, disclosures, and cost/billing scope.

The only canonical action literals are:

- `send printer-requirements inquiry`
- `activate Aether route`
- `deploy Aether`
- `submit Aether printer proof`

`A-REQ` can authorize only its named printer/contact/channel inquiry and disclosed questions or metadata. It cannot authorize implementation, artifact submission, ordering, purchase, deployment, or any `A-ACT` action. `A-ACT` authorizes only one named action and exact route/environment or printer/contact target; route activation cannot authorize deployment or printer submission. No current route is an activated Struct import/composition route, and this documentation performs no outreach, deployment, activation, or submission.

## Client composition

The visible workspace is assembled in `components/workspace/` from five UI roles:

| Role | Owner | Boundary |
|---|---|---|
| `input` | `components/rail/` | References, brand, offer, brief, research seeds, and output targets |
| `tool` | `components/canvas/` | tldraw canvas, lenses, shapes, safe zones, and one primary toolbar |
| `tool` | `components/composer/` | Bottom prompt composer with explicit global or local scope |
| `output` | workspace/canvas focus surfaces | Generated artifacts, variants, and export previews |
| `navigation` / `metadata` | `components/header/` and disclosed details | Context switching, state, versions, and provenance |

Do not mix these roles inside a single panel. Creator-facing surfaces show artifacts first; raw payloads, IDs, traces, and health details belong behind `?debug=1` or a disclosed diagnostic view.

The canvas uses tldraw's native store, frames, image shapes, and custom aether text shapes. Canvas helpers under `lib/canvas/`, `lib/auto-mode/canvas.ts`, and `lib/spatial/canvas.ts` own placement, fan-out, crop, and edit propagation. UI components should call those helpers rather than duplicate canvas geometry.

## Server and capability boundary

Next.js route handlers under `app/api/` translate HTTP requests into domain operations. Domain code lives under `lib/`; route handlers should remain thin and must not import one provider adapter as the implicit product default.

Reusable actions have two layers:

- `lib/tool/` describes the stable tool registry and artifact kinds.
- `lib/capability/` describes re-runnable capability definitions, entry references, and run templates.

An agent or creator action resolves a tool/capability entry, calls the relevant domain/provider contract, and records typed provenance. A capability definition may remember a provider hint from an example run, but routing still passes through the appropriate registry.

## Provider boundary

Provider contracts and registries live under `lib/providers/`; adapters live in domain-specific subdirectories. The current domains include image, video understanding, reference ingestion, clustering, segmentation, spatial generation, and publishing.

Rules for every adapter:

1. Depend on its domain contract, not on sibling adapters.
2. Expose availability separately from execution.
3. Return normalized results plus optional raw diagnostic data.
4. Keep provider-specific payloads out of creator-facing components.
5. Select provider/model through configuration or an explicit request hint.
6. Ship contract tests for routing, normalization, and unavailable/error behavior.

The current image contract is [lib/providers/image/types.ts](../lib/providers/image/types.ts), and its resolver is [lib/providers/image/registry.ts](../lib/providers/image/registry.ts). Treat those files, not copied examples in prose, as the API source of truth.

## Persistence and provenance

Convex is the canonical persistence layer. [convex/schema.ts](../convex/schema.ts) defines the live tables and indexes; domain queries, mutations, and actions are split across the other files in `convex/`.

The schema evolves quickly, so this document intentionally does not duplicate its table definitions. The durable model is:

```text
workspace/context inputs
        |
        v
selected input set --> capability run --> generated or edited artifact
        |                    |                         |
        |                    v                         v
        |              typed entry ref          canvas placement
        |              inputs/outputs           key visual/variant
        |              provider/model                  |
        |              timing/status                   v
        `--------------------------------------> export/provenance
```

Every action that changes workspace state must preserve enough lineage to answer:

- What tool, skill, or workflow ran?
- Which selected inputs and constraints were used?
- Which provider/model handled the request?
- What artifacts were produced?
- What canvas state existed before and after the change?
- Was the change global to linked variants or local to one format?

Session-only UI state stays local. Canonical creator context, artifacts, runs, and lineage belong in Convex. Large generated bytes use Convex File Storage or the storage binding selected by the owning flow; database rows retain stable references and metadata.

## Request flow

```text
creator prompt or direct action
  -> capture canvas selection, active input set, brief, brand, and targets
  -> resolve tool/capability entry
  -> resolve provider through its registry
  -> run provider/domain operation
  -> normalize result
  -> record capability run and lineage
  -> place or update artifact on the canvas
  -> propagate global changes; preserve local overrides
  -> expose diagnostics only in the disclosed debug surface
```

Failures should be scoped to the owning step. One unavailable adapter or failed variant must not erase successful artifacts from the same creator action.

## Deployment topology

The deployment path is defined by live configuration, not by this diagram:

- `next.config.ts` configures the Next.js runtime and loads local `.dev.vars`.
- `open-next.config.ts` configures OpenNext's Cloudflare adapter.
- `wrangler.jsonc` defines Worker environments, routes, bindings, and non-secret variables.
- `package.json` owns preview and deployment commands.

The staging and production scripts build the OpenNext worker, deploy Convex functions, and deploy the corresponding Cloudflare Worker. Secrets must be supplied through the environment/secret stores; never add them to `wrangler.jsonc`, `.dev.vars.example`, logs, traces, or generated output directories.

## Parallel-work contract

Parallel slices should own a narrow module plus its tests:

- canvas behavior: `lib/canvas/` or `components/canvas/`
- rail behavior: `components/rail/`
- provider behavior: one adapter and its contract tests under `lib/providers/<domain>/`
- capability behavior: `lib/capability/`, `lib/tool/`, or one agent tool
- persistence behavior: one Convex domain file plus schema/index changes when required

Cross-module work meets at public types and registries. Integration and creator-loop tests under `tests/` are the shared proof surface. Use isolated worktrees for parallel changes and avoid editing generated output as source.

## Related guidance

- [AGENTS.md](../AGENTS.md) — product identity and UI contract
- [CLAUDE.md](../CLAUDE.md) — implementation guardrails and commands
- [TESTING.md](./TESTING.md) — validation strategy
- [agent-routing.md](./agent-routing.md) — issue and agent ownership
