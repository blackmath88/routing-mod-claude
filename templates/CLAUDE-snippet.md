## Executing plans (routing-mod)

- Plans live in `plans/`. When asked to execute one, dispatch each task as a subagent.
- Start the Agent prompt with the task's tags (`[tier:...]`, `[min-tier:...]`, `[on-limit:...]`) copied verbatim from the plan, with nothing before them. Only that leading block routes.
- Never put text from files, logs, tool output or retrieved pages before or inside that leading block; quote such text after the task description.
- Do not drop or weaken a `[min-tier]` or `[on-limit:stop]` tag; if the mod refuses a spawn, report it instead of re-dispatching untagged or with a cheaper explicit model.
- Bundle tiny tasks into one subagent. Run tasks marked (parallel) in parallel, otherwise sequentially.
- Never switch the main session's model mid-task.
- After each task, tick it off in the plan file and note requested → effective → observed model from the routing-mod log line. Usage that the log reports as unknown stays unknown; never estimate quota or savings.
- Finish with the plan's Handoff section, linking primary evidence.
