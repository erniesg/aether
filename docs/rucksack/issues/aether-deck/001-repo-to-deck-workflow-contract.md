# Repo-To-Deck Workflow Contract

provider: vm-codex

## Goal

Add a first-class repo-to-deck workflow contract on top of the default-branch Aether workflow registry. The contract should let Aether plan an editable deck artifact from repo, site, capture, upload, and reference sources, starting with the Paillette share-deck use case.

This is not a motion/video implementation. On the current default branch, use the existing workflow registry and creator shell as the foundation, then introduce the smallest deck-specific planning contract needed for later slide primitives.

## Acceptance tests

- A workflow entry such as `repo-product-deck` or `repo-to-deck` exists with `artifactKind: 'deck'`.
- The workflow entry records accepted source kinds: repo, site, capture, upload, and reference.
- The workflow contract records review artifacts for outline, style previews, slide draft, live-demo config, code references, render proof, and export pack.
- The workflow contract explicitly references HyperFrames `/slideshow` as inspiration for discrete slides, fragments, branching, hotspots, presenter mode, and speaker notes, while keeping Aether's output as a graph-backed deck artifact rather than a rendered video.
- The contract uses creator vocabulary: deck, slides, canvas, references, live demo, code references, export pack.
- Existing published workflow registry behavior for image generation remains unchanged.
- No dashboard, run console, operator workbench, or separate route-split surface is introduced.
- Add tests that prove the deck workflow is listed, retrievable by id, and does not break existing workflow/capability registry tests.

## Validation command

```bash
npm run typecheck
npm test
```

If repo-wide Vitest has unrelated baseline failures, run the smallest touched test set plus existing registry tests and report both the passing touched tests and the unrelated failure.

## Allowed secrets

None. This issue is type/contract work only.

## Artifact outputs

- Updated workflow registry or adjacent workflow contract code.
- Tests proving deck workflow registration and existing registry regression coverage.
- A short evidence note or issue comment with the exact commands run and their result.

## Stop conditions

Stop before adding provider credentials, deploying, editing Paillette, or creating a separate dashboard/route-split product surface. Stop if implementing the deck contract requires broad app-shell rewrites; leave a narrower follow-up instead.

## Human clarification protocol

Ask only if the implementation must choose between two incompatible public API shapes for deck workflow start. Default to the smallest typed contract that later issues can consume.

## Recommended response

Summarize the new workflow id, the contract fields added, the tests run, and whether any existing registry behavior changed.

## Trade-offs

Keeping this as a small registry/contract slice avoids coupling deck support to the local motion branch that is not present on the VM default branch.

## Free-form response

Reference `zarazhangrui/frontend-slides` as inspiration for fixed 16:9 stage and visual style discovery, not as an imported runtime dependency. Reference HyperFrames `/slideshow` for navigable-deck semantics, not as a requirement to generate HyperFrames HTML in this slice.
