<!-- BEGIN public-repo-header -->
<div align="center">

# routing-mod-claude

<a href="https://github.com/blackmath88/routing-mod-claude"><img alt="Primary language: Shell" src="https://img.shields.io/badge/language-Shell-526078?style=flat"></a>
<a href="https://github.com/blackmath88/routing-mod-claude#readme"><img alt="README" src="https://img.shields.io/badge/docs-readme-16796f?style=flat"></a>
<a href="https://github.com/blackmath88/routing-mod-claude/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/blackmath88/routing-mod-claude?style=flat&amp;color=737373"></a>

</div>
<!-- END public-repo-header -->

Claude Code mod: plan in chat, route execution by tier.

Each subagent's model comes from the `[tier:...]` tag in its task:
`light` → Haiku · `standard` → Sonnet · `deep` → Opus.
Untagged tasks are classified by Haiku. Above 85 % rate-limit usage, tasks step down one tier.
Every subagent is told to return a summary under 150 words.

The main session never switches model, so its prompt cache stays intact.

## Requirements
Claude Code v2.1.287+ (mods).

## Try it
```
claude --plugin-dir ./routing-mod-claude
claude plugin validate ./routing-mod-claude
```

## Install from GitHub
```
/plugin marketplace add blackmath88/routing-mod-claude
/plugin install routing-mod@routing-mod-claude
```

## New machine
Clone this repository, then run:
```
./setup.sh
./setup.sh --check
```

## Recommended setup
- Main model: `/model sonnet`
- Advisor: `/advisor opus` (subagents inherit it when the pairing is valid)

## Per project
1. Copy `templates/CLAUDE-snippet.md` into the project's `CLAUDE.md`.
2. Put plans from chat into `plans/<feature>.md` (format: `templates/PLAN.md`).
3. In Claude Code: "Execute plans/<feature>.md".

Tune tiers and the limit at the top of `hooks/register.js`.
