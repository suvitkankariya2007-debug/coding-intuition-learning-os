# Final live verification handoff

Update and restart the existing laptop MCP, keeping the existing tunnel/profile.
Do not create another tunnel. In another terminal run npm run monitor:start if it
is not already enabled, then npm run monitor:status. The first four staggered
source tasks normally take about three minutes. Do not repeatedly restart the
monitor just to turn a missing status into a pass.

Run npm run verify:live from mcp-worker. This uses the real local authenticated
MCP to read an actual saved document, verify commit-pinned GitHub code and inspect
recorded monitor task results.
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

## Finish the pending real learning cycle

The software includes both write tools. A PENDING real review is not permission
to invent a learner attempt or grade. Use this prompt after refreshing Go:

```text
Use only Coding Intuition MCP calls. Select an actual catalog item, retain its
itemId and get_recommendations baseline. Read relevant preferences and history.
If discussing GitHub code, select a catalog item with codeFileCount > 0 and
call get_problem_code; inspect structuredContent and text JSON. Report a real
empty/error result; do not infer content from the file name.
Ask me one short recall or dry-run question for that problem and wait for my
answer. Give feedback grounded in my answer, starting with a gentle hint if needed.
Propose one brief factual reasoning observation and ask my approval before
record_reasoning_event. Include mistakeClass only when supported by my answer.
Then explain the 0-5 recall scale: 0 no recall, 1 wrong with recognition,
2 recalled only with major help, 3 correct with difficulty, 4 correct with small
hesitation, 5 correct easily. Ask me to confirm my grade.
Only after that confirmation call record_review using the real itemId and a
unique clientEventId. Reuse the same ID for any retry of the same write.
Read get_problem_history and get_learning_signals and diagnose_weaknesses.
Report the event and review clientEventIds, itemId, document receipts and nextDue.
Compare recommendations with the baseline without requiring changed ordering.
If any result is empty, failed or pending, preserve that status.
Do not fabricate acceptance, independent understanding, an attempt or consent.
```

After restarting the local server, use the returned nonsecret IDs in this
read-only checker (replace the placeholders with actual returned values):

```bash
npm run verify:learning -- --item-id ACTUAL_UUID --event-id ACTUAL_EVENT_ID --review-id ACTUAL_REVIEW_ID
```

It checks stored IDs and the current review schedule, without creating records
or printing private reasoning text. It cannot certify Go calls or learner
understanding. Old history is bounded; missing old IDs need source retrieval.
