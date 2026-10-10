# routing-mod-claude

Claude Code mod: plan in chat, route execution by tier.

Each subagent's model comes from the **routing contract**: the `[kind:value]` tags at the very start of its
prompt, e.g. `[tier:deep][min-tier:deep][on-limit:stop] Review the auth change`. Only that leading block is
trusted. Tag-like text anywhere later (quoted code, logs, retrieved pages) never affects routing and is passed
through unchanged; the log counts it as ignored. A malformed or conflicting leading block (`[tier:huge]`,
`[tier:deep][tier:light]`, any other `[x:y]` token at the start) refuses the spawn. Claude Code exposes no
structured routing metadata on the Agent tool or `agent.spawn` (checked on 2.1.296), hence the leading block.

Tier mapping:
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
- Protected work is recognised by **keywords** — a routing heuristic, **not a security boundary**: it can only
  raise the tier (never lower it), it can be triggered or missed by any text in the task, and it does not
  protect anything by itself. Use explicit `[min-tier]` / `[on-limit:stop]` where quality matters. Matched words in the description or prompt (security/secure, vulnerability, threat,
  exploit, pentest, secret, credential, auth/access/API/session tokens, permission, privacy, sandboxing/sandbox escape,
  SQL/command/prompt/code/shell injection, XSS, CSRF, SSRF, OAuth, auth*, crypto*, architecture, review, audit).
  It defaults to `keep` at the limit. Without any `[tier]`/`[min-tier]` tag it also gets an implicit floor of
  `standard` (a cheaper explicit model or classification is raised; an explicit model of unknown tier is kept and
  logged). An explicit `[tier]` tag beats the implicit floor. Keywords can misfire either way; tag such tasks explicitly.
- A malformed or conflicting leading contract refuses the spawn (fix the tags); there is no strictest-wins guessing.
- If routing itself fails, a task with a floor, `[on-limit:stop]` or protected keywords is refused; anything else runs
  on the engine's default model, and the failure is logged.
- Usage the engine does not report (off a subscription, no reading yet, an error) is **unknown**:
  no limit protection is applied and the log says so. No quota or savings figures are estimated.

### What the log shows
One `$.ui.log` line per spawn: `requested <tier> (<source>) → effective <tier> (<model>) · observed <model the engine started>
· usage <window %|unknown> · <reasons>`. A downgrade reads `DOWNGRADED deep -> standard`; an observed model whose tier
differs from the routed one is flagged `[OBSERVED != EFFECTIVE]`.

The main session never switches model, so its prompt cache stays intact.

## Requirements and compatibility
Claude Code with mods. This hook revision was tested only on **Claude Code 2.1.296** (`claude plugin validate`,
`claude plugin test`). 2.1.287 (the `setup.sh` known-good version in LIFECYCLE.md) and other versions are
**unverified** for this hook; runtime activation in a real session is unverified on every version.

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
