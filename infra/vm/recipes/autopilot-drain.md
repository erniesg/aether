# Rucksack Autopilot Drain Timer

This repo includes a user-level systemd timer for a trusted VM to dispatch the
same default-branch workflows that GitHub schedules run.

Prerequisites on the VM:

```bash
command -v rucksack
gh auth status
```

Install or update the timer from the repository root:

```bash
mkdir -p ~/.config/systemd/user
cp infra/vm/systemd/rucksack-autopilot-drain.service ~/.config/systemd/user/
cp infra/vm/systemd/rucksack-autopilot-drain.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now rucksack-autopilot-drain.timer
systemctl --user list-timers rucksack-autopilot-drain.timer
```

Inspect runs:

```bash
journalctl --user -u rucksack-autopilot-drain.service -f
```

Manual equivalent:

```bash
rucksack autopilot drain erniesg/aether --refresh-ledger --execute
```

The timer file contains only repo names and command flags. Keep tokens in the
VM user's existing `gh`/provider auth stores, not in this repository.
