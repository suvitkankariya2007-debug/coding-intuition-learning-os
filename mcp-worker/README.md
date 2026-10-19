# Coding Intuition MCP

Standalone runtime for the existing 188-problem learning system. It reuses the repository's pure recommendation, concept-graph, progressive-hint and SRS modules. The web app and existing curriculum/progress tables are untouched.

The current work targets **ChatGPT web through the existing private Secure MCP Tunnel**, following the user's successful mock-server test report. See [local setup and learning workflow](LOCAL_TUNNEL.md). No cloud deployment is required for that route. The hosted OAuth route below remains available separately; Go eligibility is not inferred from general plan documentation or guaranteed for other accounts.

## Architecture

ChatGPT Go → OAuth-protected MCP → Supermemory OAuth → `leetcode_problems` → bounded semantic retrieval + incremental document reconciliation → concept/weakness ranking → practice and reviews.

Cloudflare Workers hosts the endpoint. Cloudflare's maintained OAuth provider handles PKCE, browser-bound consent, token audience, refresh, revocation, DCR and CIMD. Upstream Supermemory tokens are encrypted inside OAuth grant properties; the downstream ChatGPT token is never forwarded upstream. Only the configured Supermemory owner and `leetcode_problems` are allowed.

Workers KV stores authentication records. One SQLite-backed Durable Object per owner stores short-lived query caches, provider version markers, structured observation/review receipts and a minimal learning ledger. Raw chats, screenshots, source code and the full Supermemory corpus are not copied into a second database. Credentials are not stored in that ledger. Snapshot chunks and write receipts commit atomically.

## Tools

The 13 existing learning tools cover the roadmap, recommendations, due reviews, progress, problem history, weaknesses, transfer, progressive hints, memory patterns, concept connections, learning signals, reasoning observations and source status. Three additions provide `record_review`, `refresh_learning_memory`, and `sync_learning_source`.

Read-only permission is `learning:read`; recording needs `learning:write`. Each memory write needs an approved short structured observation, uses a stable idempotency key, and is explicitly distinguished from verified acceptance. A failed/ambiguous upstream write remains pending; do not resubmit under a new ID. Reconcile the memory documents first.

## Cost controls

- No LLM API calls, embeddings service, PostgreSQL service, Lovable agent call or Vercel deployment.
- Supermemory uses its normal MCP OAuth connection. Its existing account's limits still apply.
- Targeted memory search caches at most 50 queries for five minutes. Source sync caches for ten minutes.
- Sync reads one page of three documents; unchanged document versions do not download again. Follow `nextPage` until null. Source and memory completeness are reported explicitly.
- No scheduled polling, cron, automatic bulk indexing, or paid deployment step. CI checks only code/build/tests.
- The hosting account must be on its intended free plan; do not enable a paid plan or upgrade to satisfy deployment.

These hosting statements describe the hosted Worker. The private tunnel route requires the existing tunnel-client's restricted OpenAI runtime key for tunnel access, not model inference. It does not require Cloudflare. Tunnel traffic, Supermemory and Go remain subject to their own limits and billing; no unlimited-use claim is made.

## Verify locally

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
- Codeforces `suvitkankariya2007`: paginated public submissions, up to 1,000 per call; continue `nextCursor` when provided. CF problems retain distinct identifiers and are not guessed to match LeetCode problems.
- GitHub `suvitkankariya2007-debug/LeetCode-Challenge`: public current tree, exact normalized filename matching, commit-pinned code links. Exporter folder numbers are not LeetCode problem IDs. A code file is revision evidence, not an accepted verdict.
- Memory documents can restore only validated structured event/review envelopes. Free-form memories inform coaching through search; they never automatically create grades or mastery. The structured ledger retains observations independently of semantic memory extraction. Existing SQL progress is not automatically copied; the old web app retains it.

## Connection review

Keep Supermemory OAuth. Public LeetCode/Codeforces/GitHub reads need no additional account login. GitHub write access is needed only during code maintenance. Lovable, Vercel, Supabase, Railway, Google Drive, Notion, Gmail, LinkedIn and a paid model API are not runtime dependencies of this MCP. This is a dependency review, not permission to uninstall or delete those apps or their data.

## Release status

Deployment is paused at the user's request. Finish local implementation and verification without continuing hosting sign-in, creating KV resources, running the deployment preparation script, or publishing the Worker. Public endpoint publishing requires a later deployment decision; the private tunnel route does not require deployment.

The private tunnel implementation can be verified on the user's laptop without cloud deployment. Its remaining live gates are Supermemory OAuth on that laptop and actual learning-tool calls through the existing tunnel. The mock-server report is account-specific evidence of tunnel read/write support; it does not establish these real-service gates.

Implementation and local protocol verification are separate from deployment. Hosting authentication, live Supermemory OAuth, and the final ChatGPT Go tool call remain release gates until observed. No public MCP URL is claimed ready by this source alone.
