# Rucksack Issue Ledger

This directory stores reviewable markdown issue specs for `erniesg/aether`.

Generate or update specs with:

```bash
rucksack github issues plan erniesg/aether --repo-root . --issue-dir docs/issues --execute
```

After reviewing the generated specs, seed or update GitHub issues:

```bash
rucksack github issues seed erniesg/aether --issue-dir docs/issues --label rucksack-ledger --label rucksack-queued --execute
gh workflow run rucksack-autopilot.yml --repo erniesg/aether -f action=queue
```

The GitHub issues are the live queue. Use `/rucksack run #123`, `/rucksack queue`,
or labels such as `rucksack-queued` and `rucksack-run` to dispatch work.

The installed `.github/workflows/rucksack-ledger.yml` workflow can refresh this
directory from repo context through the Codex app-server planner, seed/update
GitHub issues, and open a review PR for changed specs.
