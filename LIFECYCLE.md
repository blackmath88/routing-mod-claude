# Lifecycle: routing-mod

## Invariants

- The main session's model is never switched.
- Only ordinary subagents are routed; forks, teammates (`isTeammate`) and workflow agents (`workflow`) pass through.
- An explicit `e.model` on an untagged task is respected.
- The `[tier:]` tag is stripped.
- Above 85% rate-limit usage, tasks step down one tier.

## Known-good Claude Code version

Claude Code 2.1.292.

## What to watch upstream

- Changes to the `agent.spawn` event and its input fields.
- The mods type declarations at https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts.
- `claude plugin validate` / `claude plugin test` behaviour.
