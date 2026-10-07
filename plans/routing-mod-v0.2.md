# Plan: routing-mod v0.2 (lifecycle-lite)

- [x] 1. [tier:standard] Fix hooks/register.js: route only ordinary subagents. Leave forks, teammates and workflow agents untouched (pass through with next(e)). Keep existing invariants: explicit e.model respected, [tier:] tag stripped.
- [x] 2. [tier:light] Reword RETURN_RULE in hooks/register.js so it starts with "After you finish the task above," and only asks for a summary under 150 words.
- [x] 3. [tier:standard] Add hooks/register.test.js for `claude plugin test`: one fake agent.spawn per tier (light/standard/deep), plus a fork, an explicit model, and a teammate, each asserting the resulting model. Stub $.model.classify. Run it until it passes.
- [x] 4. [tier:light] Add LIFECYCLE.md (~15 lines): invariants, known-good Claude Code version (current one), what to watch upstream (agent.spawn changes, mods types, plugin validate). Add a "Known good with" line to README.
- [x] 5. [tier:light] Add .github/workflows/weekly-check.yml: weekly + manual trigger, install latest Claude Code via npm, run `claude plugin validate .` and `claude plugin test`, open an issue only on failure. No LLM, no auto-PRs.

Done when: validate passes, tests pass, one commit "routing-mod v0.2", pushed.
