# routing-mod-claude

Claude Code mod: plan in chat, route execution by tier.

Each subagent's model comes from the `[tier:...]` tag in its task:
`light` → Haiku · `standard` → Sonnet · `deep` → Opus.
Untagged tasks are classified by Haiku (falling back to `standard`, said in the log). A task with no tag
and an explicit `model` keeps that model. Forks inherit the parent's model and are left alone.
Every subagent is told to return a summary under 150 words.

### Quality floors and usage limits
- `[min-tier:light|standard|deep]`: the task is never routed below this tier (an explicit cheaper model is raised;
  a fork whose parent is below the floor is refused, with a message to dispatch it as a non-fork).
- `[on-limit:step-down|keep|stop]`: what happens at or above 85 % of a rate-limit window.
  Default: `step-down` one tier, **except** protected work, which defaults to `keep`.
  `stop` refuses the spawn instead of running it on a weaker model.
- Protected work is recognised by **keywords** in the description or prompt (security/secure, vulnerability, threat,
  exploit, pentest, secret, credential, token, permission, privacy, sandbox, injection, XSS, CSRF, SSRF, OAuth, auth*,
  crypto*, architecture, review, audit). Without an explicit `[min-tier]` it gets an implicit floor of `standard`
  (a cheaper explicit model or classification is raised) and `keep` at the limit. Keywords can misfire either way;
  tag such tasks explicitly.
- A misspelled `[min-tier:...]` / `[on-limit:...]` tag refuses the spawn (fix the tag); an unknown `[tier:...]` value
  is ignored and logged. Conflicting tags resolve to the strictest and are logged.
- If routing itself fails, a task with a floor, `[on-limit:stop]` or protected keywords is refused; anything else runs
  on the engine's default model, and the failure is logged.
- Usage the engine does not report (off a subscription, no reading yet, an error) is **unknown**:
  no limit protection is applied and the log says so. No quota or savings figures are estimated.

### What the log shows
One `$.ui.log` line per spawn: `requested <tier> (<source>) → effective <tier> (<model>) · observed <model the engine started>
· usage <window %|unknown> · <reasons>`. A downgrade reads `DOWNGRADED deep -> standard`; an observed model whose tier
differs from the routed one is flagged `[OBSERVED != EFFECTIVE]`.

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

## Tests
```
node --test tests/*.test.mjs     # portable: routing decision + hook wiring with a fake engine
claude plugin test .             # engine-level: runs tests/engine.test.ts against the installed engine
claude plugin validate .
```
See `docs/QUALIFICATION.md` for what has and has not been verified (runtime activation included).
