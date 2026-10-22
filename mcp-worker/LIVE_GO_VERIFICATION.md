# Final live verification handoff

Update and restart the existing laptop MCP, keeping the existing tunnel/profile.
Do not create another tunnel. In another terminal run npm run monitor:start if it
is not already enabled, then npm run monitor:status. The first four staggered
source tasks normally take about three minutes. Do not repeatedly restart the
monitor just to turn a missing status into a pass.

Run npm run verify:live from mcp-worker. This uses the real local authenticated
MCP to read an actual saved document and inspect recorded monitor task results.
It emits no raw text or credentials. It deliberately cannot certify Go access.

Paste the following into the existing Go connection after refreshing its 24 tools:

```text
Verify the actual Coding Intuition MCP connection with live tool calls.
Use list_learning_documents to select a real saved document in leetcode_problems.
Read it with read_saved_discussion, following every nextOffset with the same
returned version. Report its document ID, total character count and whether the
provider supplied complete content; stop and report any version change or truncation.
Then call get_monitor_status. Report enabled, nextRunAt, and each expected task's
status, checkedAt and lastSuccessAt for LeetCode, Codeforces, GitHub and memory.
Treat missing, stale, partial or failed task results as PENDING/PARTIAL/FAIL, not PASS.
Do not replace background evidence with manual source sync calls. Do not substitute
the separate Supermemory connector for this MCP. Do not save invented learning
records. Return the actual results in one compact report. If the learning tools
are absent, stop and report stale/missing connection discovery.
```

Only the actual Go tool-call report proves that boundary. The SDK local checker,
fixture tests, Supermemory connector and enabled monitor configuration are
separate evidence. Nothing here authorizes deployment or merge.
