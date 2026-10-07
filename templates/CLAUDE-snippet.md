## Executing plans (routing-mod)

- Plans live in `plans/`. When asked to execute one, dispatch each task as a subagent.
- Copy the task's `[tier:light|standard|deep]` tag verbatim into the Agent prompt. The routing mod picks the model from it.
- Bundle tiny tasks into one subagent. Run tasks marked (parallel) in parallel, otherwise sequentially.
- Never switch the main session's model mid-task.
- After each task, tick it off in the plan file.
