# Agent Environment

Names only. Do not write secret values in this file.

- Repository: `aether`
- OS detected during scaffold: `macOS-15.6.1-arm64-arm-64bit`
- Package manager: `npm`

Common account bootstrap checks:

- `gh auth status` for GitHub write/read operations.
- `bw status` for human Bitwarden vault status, if used interactively.
- `bws project list` for Bitwarden Secrets Manager machine access, if configured.
- `wrangler whoami` for Cloudflare projects.
- `tailscale status` for trusted VM access.
- `infra/vm/verify.sh` for reusable VM service, port, disk, memory, and Tailscale checks.

Agents should request human setup instead of asking for secrets in chat.
