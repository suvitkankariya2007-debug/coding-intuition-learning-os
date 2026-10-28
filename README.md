# Coding Intuition MCP

Adaptive runtime with the 188-problem curriculum as a seed plus newer GitHub, LeetCode, Codeforces and conversation problems. It reuses the repository's pure recommendation, concept-graph, progressive-hint and SRS modules. The web app and existing curriculum/progress tables are untouched.

The runtime supports both a **hosted OAuth-protected MCP Worker** and the optional private Secure MCP Tunnel for local testing; see [local tunnel test instructions](LOCAL_TUNNEL.md). A Worker deployed earlier may still be running an older revision. The catalog-import changes described here have been locally verified and require a separate deploy before they appear on any hosted endpoint. A Go-account mock-server report is useful test evidence, but does not prove a live Supermemory authorization or a successful ChatGPT call.

## Architecture

ChatGPT Go → hosted OAuth-protected MCP → Supermemory OAuth → `leetcode_problems` → bounded semantic retrieval + incremental document reconciliation → concept/weakness ranking → practice and reviews.

Cloudflare Workers hosts the endpoint. Cloudflare's maintained OAuth provider handles PKCE, browser-bound consent, token audience, refresh, revocation, DCR and CIMD. Upstream Supermemory tokens are encrypted inside OAuth grant properties; the downstream ChatGPT token is never forwarded upstream. The default private mode permits only the configured Supermemory owner in `leetcode_problems`, with the explicit read allowlist. An opt-in hosted multi-user mode assigns each other authenticated account a separate server-derived private namespace and verifies it during OAuth; new learners never inherit the owner memory spaces or coding handles. A per-owner SQLite Durable Object keeps the durable learning ledger and bounded one-hour semantic-search cache; writes invalidate cached memory results so later retrieval sees new learning promptly.

Workers KV stores authentication records. One SQLite-backed Durable Object per owner stores short-lived query caches, provider version markers, structured observation/review receipts and a minimal learning ledger. Raw chats, screenshots, source code and the full Supermemory corpus are not copied into a second database. Credentials are not stored in that ledger. Snapshot chunks and write receipts commit atomically.

## Tools

See [the expanding adaptive workflow](ADAPTIVE_WORKFLOW.md). `get_learning_catalog` includes newer problems outside the canonical seed; `get_problem_code` fetches bounded pinned GitHub code for discussion. Profile sync now contributes external LC/CF problems and previously unmatched GitHub files to recommendations. Approved question observations and external recall reviews persist across recovery. `refresh: true` bypasses memory caches, and source sync accepts `force: true` after new activity. Additional memory read spaces require explicit configuration.

There are 38 tools for catalog/history, recommendations, due reviews, source sync, profile and cross-chat continuity, discussion review, monitoring, and memory access. `import_problem_catalog` accepts learner-supplied catalogs of up to 50 problems per call; the full workflow is in [CUSTOM_CATALOGS.md](CUSTOM_CATALOGS.md). Custom catalog entries participate in evidence ranking and concept transfer, and `get_recommendations` can target one uploaded catalog. `get_learning_catalog` also includes problems discovered in GitHub, LeetCode, Codeforces, and learner discussions. See [the expanding adaptive workflow](ADAPTIVE_WORKFLOW.md), [learner profiles](LEARNER_PROFILES.md), and [cross-chat continuity](CROSS_CHAT_CONTINUITY.md).

Read-only permission is `learning:read`; recording needs `learning:write`. Each memory write needs an approved short structured observation, uses a stable idempotency key, and is explicitly distinguished from verified acceptance. A failed/ambiguous upstream write remains pending; do not resubmit under a new ID. Reconcile the memory documents first.

## Cost controls

- No LLM API calls, embeddings service, PostgreSQL service, Lovable agent call or Vercel deployment.
- Supermemory uses its normal MCP OAuth connection. Its existing account's limits still apply.
- Targeted memory search caches at most 50 queries for one hour. Unexpired entries are retained when capacity is full; additional queries bypass caching. Confirmed writes, explicit refresh and reconciliation invalidate results early to prevent stale coaching. Source sync caches for ten minutes.
- Sync reads one page of three documents; unchanged document versions do not download again. Follow `nextPage` until null. Source and memory completeness are reported explicitly.
- Optional periodic source/document reads use durable alarms, one bounded task per wake-up with backoff. No paid deployment step is part of verification; CI runs code/build/tests only.
- The hosting account must be on its intended free plan; do not enable a paid plan or upgrade to satisfy deployment.

These hosting statements describe the hosted Worker. The private tunnel route requires the existing tunnel-client's restricted OpenAI runtime key for tunnel access, not model inference. It does not require Cloudflare. Tunnel traffic, Supermemory and Go remain subject to their own limits and billing; no unlimited-use claim is made.

## Verify locally

For the live laptop setup, `npm run tunnel:doctor` verifies the actual learning
server identity with 18 read calls, without recording learning events or enabling monitoring. See
[local validation](LOCAL_VALIDATION.md). An old `Mock_MCP_E2E` tool inventory in
ChatGPT indicates the wrong or stale connection, not the learning tool contract.

From this directory:

```sh
npm ci --no-audit --no-fund
npm run verify:local
```

This command checks TypeScript and native local-script syntax, creates dry-run bundles for both entrypoints, then runs the local runtime tests. It does not deploy, create hosting resources, register an OAuth client, or use live Supermemory credits. Dependency installation needs registry access; verification uses installed dependencies and a simulated upstream. Run this command after source edits so integration tests use fresh bundles.

The integration suite runs the actual Worker bundle in workerd/Miniflare with a simulated upstream Supermemory. It tests consent cookies, wrong accounts, PKCE, code replay, scope enforcement, refresh, namespace isolation, bounded requests, query caching, concurrent retries, recommendations, review schedules and reconciliation. It does **not** establish a live user authorization or a successful ChatGPT Go call.

## Deploy after hosting authorization

The checked-in `wrangler.jsonc` is a local-development template, not a working public deployment. It deliberately lacks owner/client credentials and a real KV namespace ID. Do not paste its localhost address into ChatGPT.

1. Authenticate the intended Cloudflare account. Keep its current plan; stop if a paid upgrade is required.
2. Create a Workers KV namespace for `OAUTH_KV` and reserve the Worker hostname. The SQLite Durable Object binding is provisioned by the `v1` migration.
3. Obtain the authorized Supermemory owner's ID using that account's `who_am_i` tool. Do not assume the Go and Work accounts have the same Supermemory owner.
4. Prepare the exact deployment configuration once:

```sh
node scripts/prepare-deployment.mjs https://YOUR-WORKER.workers.dev OWNER_SUPERMEMORY_ID KV_NAMESPACE_ID
npm run deploy -- --config wrangler.local.jsonc
node scripts/verify-public.mjs https://YOUR-WORKER.workers.dev
```

The preparation script registers a public PKCE client with Supermemory and reuses that registration on retries. It creates a private, ignored local deployment configuration. No API key is requested or entered in a browser form.

5. In ChatGPT's custom MCP form use name `Coding Intuition`, the verified `https://YOUR-WORKER.workers.dev/mcp` URL, and OAuth. Allow discovery/DCR or CIMD; do not enter a Supabase bearer token or OpenAI API key. Complete consent and Supermemory login.
6. Verify `get_roadmap`, `get_memory_patterns`, `get_recommendations`, and one explicitly approved test observation. Confirm the write is in the intended space, survives a fresh connection and is idempotent on retry. Only then mark the integration live.

## Source coverage and data boundaries

- LeetCode `suvitk`: public accepted total and the latest 20 accepted submissions. Problem frontend IDs are verified using GraphQL. Recent activity is **not** complete solved history. Duplicate concept anchors are not auto-marked solved.
- Codeforces `suvitkankariya2007`: paginated public submissions contributing external problems and evidence to recommendations, up to 1,000 per call; continue `nextCursor` when provided. CF problems retain distinct identifiers and are not guessed to match LeetCode problems.
- GitHub `suvitkankariya2007-debug/LeetCode-Challenge`: public current tree, exact normalized filename matching for canonical problems, plus independently tracked new code files and commit-pinned code retrieval. Exporter folder numbers are not LeetCode problem IDs. A code file is revision evidence, not an accepted verdict.
- Memory documents restore validated structured event/review envelopes and index literal question candidates with provenance. Complete available discussions can be read in versioned pages. Free-form memories inform coaching through search; they never automatically create grades or mastery. The structured ledger retains observations independently of semantic memory extraction. Existing SQL progress is not automatically copied; the old web app retains it.

## Connection review

Keep Supermemory OAuth. Public LeetCode/Codeforces/GitHub reads need no additional account login. GitHub write access is needed only during code maintenance. Lovable, Vercel, Supabase, Railway, Google Drive, Notion, Gmail, LinkedIn and a paid model API are not runtime dependencies of this MCP. This is a dependency review, not permission to uninstall or delete those apps or their data.

## Release status

Local verification does not deploy the Worker. Existing Cloudflare deployments are separate from this checkout and can continue serving an earlier revision until the new source is deployed. The private tunnel route remains available for local testing.

The private tunnel implementation can be verified on the user's laptop without cloud deployment. Its remaining live gates are Supermemory OAuth on that laptop and actual learning-tool calls through the existing tunnel. The mock-server report is account-specific evidence of tunnel read/write support; it does not establish these real-service gates.

Implementation and local protocol verification are separate from deployment. This verification does not claim a live authorization or ChatGPT Go call for the new catalog-import feature; refresh tool discovery after deploying it.


For full saved-discussion reading, source submission history, periodic monitoring, the runnable isolated demo, and remaining live gates, see [BACKGROUND_AND_DISCUSSIONS.md](BACKGROUND_AND_DISCUSSIONS.md).

For a privacy-safe real local document/monitor report, run `npm run verify:live`. It cannot claim verification of the separate ChatGPT Go account.

The read-only review_learning_discussion tool combines quoted discussion observations with concept reminders, common pitfalls, fallback approaches, review reasons and catalog-backed platform practice. See DISCUSSION_REVIEW.md.
