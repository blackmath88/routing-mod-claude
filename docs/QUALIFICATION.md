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
- `node --test tests/*.test.mjs` — the routing decision (explicit tiers, classification and its fallback, explicit model, forks, floors, `on-limit` policies, unknown usage, the 85 % boundary, requested/effective/observed log line) and the hook wiring with a fake `$`.
- `claude plugin test .` — `tests/engine.test.ts` against the real engine, with the classifier, usage, log and spawn stubbed beneath the plugin: routing to opus, no downgrade for security review at 92 %, visible downgrade for ordinary work, `on-limit:stop` refusal, empty `rateLimits` = unknown, classifier and explicit model, observed-model mismatch flag.
- **Fork:** the test kit's `$.agent.spawn` cannot raise a real fork (`fork` arrives undefined), so fork handling is covered only by the Node tests with a fake engine.

## Not verified
- **Runtime activation** in a real session (`claude --plugin-dir .` or the marketplace install): not exercised; no global install was made. No load evidence exists, so activation is **unverified**.
- That the real engine's `percentUsed` crosses 85 % as the stubs do, and the behaviour of `[on-limit:stop]` refusals inside a real plan run.
- Cost or savings of routing: none measured, none claimed.

## Proposal (syntax)
`[tier:X]`, `[min-tier:X]`, `[on-limit:step-down|keep|stop]` in the task line, copied verbatim into the Agent prompt (see `templates/PLAN.md`, `templates/CLAUDE-snippet.md`). The protected-work keyword list (security, threat, exploit, secret, credential, permission, auth*, crypto*, architecture, review, audit) only changes the default at the limit from `step-down` to `keep`; explicit tags override it.
