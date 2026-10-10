# Plan: <feature name>

Issue: <owner/repo#number>
Goal: <one sentence>

## Refs (exact, refreshed before execution)
- Repository / base: <owner/repo> @ <full base SHA> (branch <base branch>)
- Output branch: <branch> · PR: <#n or "none yet">
- Depends on: <other PRs/issues with exact head SHAs, or "none">

## Scope
- Writable: <paths/globs this plan may change>
- Not in scope: <paths, systems, decisions this plan must not touch>
- Escalate instead of widening: architecture change, scope expansion, destructive action, security/privacy boundary, new spend.

## Budget and host
- Time: <minutes, incl. settlement; no automatic extension> · Settlement starts at: <minute>
- Paid API spend: <none | amount approved by whom>
- Host needs: <none | named host/tool/login>; unavailable hosts are reported BLOCKED, never passed.

## Tasks
Each task becomes one subagent. Keep the tags in the task line; the executor puts them at the very start of the
Agent prompt (only that leading block routes; tags quoted elsewhere are ignored; a malformed or conflicting block refuses the task).
Tags: `[tier:light|standard|deep]` requested tier · `[min-tier:...]` floor, never routed below ·
`[on-limit:step-down|keep|stop]` behaviour at >= 85 % rate-limit usage
(security / architecture / review work defaults to `keep`; use `stop` where a weaker model is unacceptable).

- [ ] 1. [tier:light] <explore / search / mechanical edit> — needs: none — writes: <paths>
- [ ] 2. [tier:standard] <normal implementation> — needs: 1 — writes: <paths>
- [ ] 3. [tier:deep][min-tier:deep][on-limit:stop] <security / architecture / review> — needs: 2 — writes: none

Tiers: light = Haiku · standard = Sonnet (+ Opus advisor) · deep = Opus
Bundle tiny tasks into one. Mark tasks that can run in parallel with (parallel) only when their writable paths are disjoint.

## Required checks
- <exact commands, e.g. `node --test tests/*.test.mjs`, `claude plugin test .`> — record what actually ran.

## Done when
- <acceptance criteria>

## Handoff (one, at the end)
- Outcome · exact output commit SHA / PR
- Changed paths
- Checks actually run (with results); checks blocked and why
- Routing observed per task: requested → effective → observed model (from the routing-mod log); usage known/unknown
- Remaining unknowns; review assurance (independent / self-review / blocked)
- Recommendation: KEEP / REVISE / REJECT (not a Decision) · next bounded action
- Evidence: links to the primary artifacts (logs, test output, commits), not just summaries
