# Generation fixtures

Recorded Claude responses, replayed by the generator when `JAROKU_GEN_FIXTURE` points at
one. They make the whole build path — streaming, staging, validation, commit — testable for
free, which matters because every real generation costs money.

Set the variable to a path that does **not** exist to record a fresh one from a real call.

| File | Purpose |
|---|---|
| `support_bot.txt` | A known-good generation. Should always pass validation. |
| `rejected-tool-call-and-sql.txt` | A real `claude-haiku-4-5` response that shipped two genuine defects: it called the `pg_query` tool directly (a `StructuredTool` is not callable) and built SQL with an f-string. Should always be **rejected** — it is the regression test for prompt rules 9 and 10. |
