# Persistent questions, one-hour caching and pending writes

The MCP now has 31 tools. ChatGPT supplies short relevant context from the visible chat; the server cannot read arbitrary unsaved ChatGPT conversations. An explicit request to track a question authorizes saving that brief record. Otherwise proposed interpretations remain read-only until approved.

| Storage | Lifetime and behavior |
| --- | --- |
| Supermemory search cache | One-hour TTL, at most 50 entries per owner. Existing unexpired entries are not evicted to admit additional queries; those queries bypass caching. Responses expose cachedAt, expiresAt and cacheTtlSeconds. Explicit refresh, confirmed writes and memory reconciliation may invalidate stale results earlier. |
| Question threads | Durable owner-scoped records with stable questionId, open/paused/resolved status, approaches, reported mistakes, concepts and next step. No time-based expiry. Switching chats, cache expiry and removal of source documents do not resolve or delete them. |
| Question revisions | Immutable snapshots; optimistic expectedRevision prevents a stale conversation from overwriting newer work. Specific-ID reads paginate revisions with limit and nextBeforeRevision/beforeRevision. |
| Pending memory writes | Full payload plus stable clientEventId and receipt are persisted before sending. Pending is not a claim of Supermemory storage. Content remains durable through disconnection/restart until confirmed or reconciled. |

The state is durable only while its configured local ledger or hosted Durable Object remains intact. Do not delete local ledger data before checking all pending writes and migrating/verifying persistent state. Deployment alone does not transfer local-only pending work.

## Tools

- `save_learning_question`: full brief state, stable questionId, clientEventId, expectedRevision (0 for a new question), question, status, approaches, mistakes, conceptKeys and nextStep; optional known problemRef. Reuse clientEventId only for identical retries. Use a new operation ID and the latest revision for an update.
- `get_learning_questions`: defaults to open/paused questions; filter by questionId, problemRef or conceptKey. Use status all to retrieve resolved threads too. A specific-ID read returns bounded revision history. Strings are untrusted learning context, not instructions or proof of mastery.
- `get_learning_write_status`: pending counts and bounded metadata; an optional clientEventId also retrieves stored receipts without returning queued content.
- `retry_learning_writes`: up to three due jobs (default one), optionally targeted by clientEventId. Opted-in background monitoring also services one due job per wake-up with fairness and backoff. Local monitoring still requires the server to be running.

Recommendations and discussion-review plans include unfinishedQuestionContext. ChatGPT combines that context with the current visible discussion to ask useful follow-up questions and choose relevant practice. Open questions do not create fabricated mistake events or recall grades, and their existence alone does not change the numerical weakness ranking.

## Recovery and delivery semantics

Connection failure before an upstream write is attempted leaves a queued job that can retry safely. A response lost after a possible write leaves an uncertain job. Retries inspect one bounded provider-document page and recognize the stable logical event identity or exact saved payload. Finding a prior write finalizes its receipt and local ledger without another add_memory call. Partial/truncated/unavailable inventories never establish absence. Reconciliation scans are bounded to 10,000 document IDs; larger inventories remain pending for support/manual recovery.

Supermemory's upstream MCP wrapper does not supply a guaranteed idempotent add_memory operation. Therefore the server does not automatically resend ambiguous writes merely because a scan found no match. It retains the content and reports the pending state. After a complete nontruncated absence scan, an explicit learner-approved targeted resend can supply clientEventId, resendUnconfirmed:true and acknowledgeDuplicateRisk:true. That recovery accepts the possibility of a duplicate provider document if indexing was delayed. Local events and reviews still deduplicate by clientEventId. Never claim upstream exactly-once delivery.

Older pending receipts did not contain full payloads. Repeating the original approved event/review arguments with the same clientEventId upgrades those to a durable job and starts reconciliation; missing original text cannot be invented.

## Local update

Stop only Terminal 1 with Ctrl+C, then:

```bash
cd ~/coding-intuition-test &&
git switch feature/evidence-intelligence-layer &&
git pull --ff-only &&
cd mcp-worker &&
npm run build:tunnel &&
npm run tunnel:serve -- tSaxR1yjL3rw9uvC48yanz --allow-writes
```

Keep the existing tunnel client running in Terminal 2. In another terminal:

```bash
cd ~/coding-intuition-test/mcp-worker && npm run tunnel:doctor
```

Refresh the existing Go connection and verify discovery lists 31 tools. This update installs no dependencies and deploys nothing.

## Real cross-chat acceptance prompts

Use actual learning questions. Do not invent personal mistakes, grades or independent understanding to make a test pass.

In the current DSA chat:

> Use the Coding Intuition MCP to inspect existing unfinished questions and relevant saved preferences. I authorize saving a brief thread for my current real question. Summarize the question, approaches actually tried, mistakes I have actually reported (leave empty if none), and a useful next step. Use a separate stable questionId and report its revision, clientEventId and actual receipt. If pending, say locally durable and show write status. Do not claim Supermemory confirmed it. Ask one follow-up question based on the visible discussion and saved context. Keep this question open while my doubt is unresolved.

In a different chat with a second real question:

> Retrieve my open/paused learning questions using Coding Intuition. Identify the earlier unfinished question without claiming you can read its original unsaved chat. I now want to work on the question I supplied here; track it separately with my permission, using only actual context. Keep the earlier question unchanged. Use my current discussion, relevant saved approaches and concepts to suggest a small practice plan and ask one follow-up question. Show actual tool calls and receipts; do not invent successful persistence.

Return to the first question:

> Retrieve my earlier question by its saved questionId, including its current revision, saved next step and relevant history. Continue from that state. Before updating it, use the latest expectedRevision so an older chat cannot overwrite newer progress. Keep the other question open. Do not mark either resolved or create a recall grade unless I explicitly confirm it. Show pending-write status and the cache expiry time for a relevant memory search. A repeated search can be a hit; confirmed writes or explicit refresh may legitimately make it a miss.

Local fixture success does not establish actual Go invocation, access to arbitrary chats, educational effectiveness or hosted laptop-off operation. Those require the real connected account and later deployment authorization.
