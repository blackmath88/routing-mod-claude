# Qualification (issue #1)

Status of the routing hook for use by the shared mobile queue. Kinds: **verified** (ran here), **unverified**, **proposal**.

## API (verified against Claude Code 2.1.296 in the session container)
- `agent.spawn` input: `prompt`, `description`, `model?` (ignored for forks), `fork`, `parentModel` (pinned). Result: `{ model, agentId? }` or `{ deny }`; the result's `model` is what the engine actually started, which the hook logs as *observed*.
- `$.model.classify(text, labels, { model })` resolves a label or `undefined`.
- `$.session.usage()` resolves `{ rateLimits: [{ kind, percentUsed, resetsAt? }] }`; `rateLimits` is **empty** off a subscription or before a reading, so it is treated as unknown, never 0 %.
- `$.ui.log(text)`. A gating hook should carry `.catch`; this one logs the failure and leaves the spawn unrouted.
- Source: the engine's bundled type contract for 2.1.296, `claude plugin validate .` ("Validation passed", hooks `agent.spawn`, calls `$.model.classify`, `$.session.usage`, `$.ui.log`, gating hook with `.catch`), and `claude plugin test .` (engine-level tests below).
- The repo's README/LIFECYCLE still name 2.1.287 as known-good; nothing was run on that version.

## Tests
- `node --test tests/*.test.mjs` (21 tests) — the routing decision (explicit tiers, classification and its fallback, explicit model, forks, floors, `on-limit` policies, unknown usage, the 85 % boundary, requested/effective/observed log line) and the hook wiring with a fake `$`.
- `claude plugin test .` (12 tests, run in this container) — `tests/engine.test.ts` against the real engine, with the classifier, usage, log and spawn stubbed beneath the plugin: routing to opus, no downgrade for security review at 92 %, visible downgrade for ordinary work, `on-limit:stop` refusal, empty `rateLimits` = unknown, classifier and explicit model, observed-model mismatch flag.
- **Fork:** the test kit's `$.agent.spawn` cannot raise a real fork (`fork` arrives undefined), so fork handling is covered only by the Node tests with a fake engine.

## Not verified
- **Runtime activation** in a real session (`claude --plugin-dir .` or the marketplace install): not exercised; no global install was made. No load evidence exists, so activation is **unverified**.
- That the real engine's `percentUsed` crosses 85 % as the stubs do, and the behaviour of `[on-limit:stop]` refusals inside a real plan run.
- Cost or savings of routing: none measured, none claimed.

## Proposal (syntax)
`[tier:X]`, `[min-tier:X]`, `[on-limit:step-down|keep|stop]` in the task line, copied verbatim into the Agent prompt (see `templates/PLAN.md`, `templates/CLAUDE-snippet.md`). Protected work is keyword-matched (the list is `PROTECTED` in `hooks/register.js`, vulnerability included); without an explicit `[min-tier]` it gets an implicit floor `standard` and `keep` at the limit. Explicit tags override the limit default; a stricter explicit floor wins. Keyword matching can misfire both ways.

## Supplementary review (not independent)
A same-model, context-isolated read-only pass on `8460d6c` returned REVISE (2 High, 4 Medium, 8 Low). Fixed in the next commit with tests: widened keywords, implicit floor for protected work (explicit model and classifier paths), unknown model under a floor raised, malformed floor/limit tags refused, conflicting tags logged (strictest wins), `.catch` refuses guarded tasks and never re-spawns after `next()`, engine denials logged, accurate keep reason, unverifiable observed tier flagged, fork tag noted. Open: `percentUsed` scale (0–100 per the types) untested against a live engine; tags quoted inside code text are still honoured. *(Superseded in slice 3: conflicts now fail closed and only the leading block routes; quoted tags are ignored.)*

A second same-model delta pass on `f3c70a4` returned REVISE: implicit floor overriding an explicit model of unknown tier, keyword false positives (`tokens`, `injection`, `sandbox`), an always-on log note and an over-broad `.catch` guard. All fixed with tests. Its claim that `.catch` re-spawns after `next()` contradicts the engine contract (`next` is replay-safe in `.catch`: when `called`, `next(e)` resolves to the first result); the test now models that contract and asserts a single spawn. That contract itself was read from the 2.1.296 types, not exercised against the real engine.

## Trusted routing contract (slice 3)
- **API check (2.1.296 types):** `agent.spawn` input has no metadata field (tool_use_id, prompt, description, subagentType, provider, model, parentModel, parentAgentId, permissionMode, background, fork, isTeammate, workflow, name, cwd), and the Agent tool's parameters carry none either (`model` is the only structured choice, and the caller sets it). So routing instructions live in one bounded leading block: the run of `[kind:value]` tokens at the very start of the prompt.
- Tag-like text after the block is never parsed and never stripped (quoted code stays byte-identical); the log counts it as ignored.
- Fail closed: an unknown kind or value, or two different values for one kind, in the leading block refuses the spawn, and refuses again in `.catch` if routing itself fails.
- Trust anchor: the leading block is whatever the dispatching session writes first. If that session copies untrusted text into the start of a prompt, the text is trusted. The CLAUDE snippet tells it not to; nothing in the hook can enforce it.
- Keyword detection of protected work is a routing heuristic, not a security boundary: it only raises (implicit floor `standard`, `keep` at the limit) and any task text can trigger or evade it.
- Tests: `tests/route.test.mjs` cover code, log and retrieved-text injection, fail-closed contracts, a floor that survives high usage and every policy, explicit low models, and routing errors; `tests/engine.test.ts` repeats the core cases on the real engine.

## Version compatibility
Tested: Claude Code 2.1.296 only. 2.1.287 and other versions are unverified for this hook. Runtime activation is unverified on all versions (no install, no load evidence).

## Review
Independent review: **pending** (no qualified route in these sessions). Supplementary same-model passes are recorded above and are not a substitute.
