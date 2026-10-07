# Lifecycle

## Machine contract

Known-good Claude Code version: 2.1.287

`./setup.sh` installs or updates the `routing-mod@routing-mod-claude` user plugin, adds the `Executing plans (routing-mod)` snippet to `~/.claude/CLAUDE.md` if absent, and sets `model` to `sonnet` and `advisorModel` to `opus` in `~/.claude/settings.json`. Existing settings are backed up before replacement; unsupported settings shapes fail during preflight before installation changes.

`./setup.sh --check` reports whether the plugin and snippet are present, both model settings match, and the installed Claude Code version is at least the version recorded above. It exits nonzero if any check fails.
