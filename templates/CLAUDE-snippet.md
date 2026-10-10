## Executing plans (routing-mod)

- Plans live in `plans/`. When asked to execute one, dispatch each task as a subagent.
- Copy the task's tags (`[tier:...]`, `[min-tier:...]`, `[on-limit:...]`) verbatim into the Agent prompt. The routing mod picks the model from them.
- Do not drop or weaken a `[min-tier]` or `[on-limit:stop]` tag; if the mod refuses a spawn, report it instead of re-dispatching untagged or with a cheaper explicit model.
- Bundle tiny tasks into one subagent. Run tasks marked (parallel) in parallel, otherwise sequentially.
- Never switch the main session's model mid-task.
- After each task, tick it off in the plan file and note requested → effective → observed model from the routing-mod log line. Usage that the log reports as unknown stays unknown; never estimate quota or savings.
- Finish with the plan's Handoff section, linking primary evidence.
