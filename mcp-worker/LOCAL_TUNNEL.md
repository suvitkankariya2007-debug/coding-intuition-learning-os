# Optional local test path: ChatGPT web through a private tunnel

This is an optional pre-deployment test path, not the intended always-on setup. A local background process runs the learning tools, and your existing Secure MCP Tunnel forwards tool calls to it. Your laptop must stay on only while testing this route. The intended finished setup is the hosted OAuth-protected Worker described in [README](README.md); after that is deployed, the laptop and tunnel client are not needed for normal use. Deployment remains paused until the hosted flow, objective checks and release gates pass.

## What the supplied report establishes

The report dated 19 October 2026 records read calls, creation of MOCK-004, and a subsequent read confirming four records through the tested Go account and Secure MCP Tunnel. It used a mock server without OAuth. It does not establish real Supermemory sign-in, learning tool behavior, all Go account eligibility, or unlimited use. The attached copies have identical text and contain no embedded screenshots.

OAuth discovery returning 404 was consistent with that mock server; it was not a failed OAuth test. The local learning mode deliberately follows the same no-downstream-OAuth tunnel pattern. It authenticates to Supermemory separately.

## Connections and data

| Connection or store | Purpose |
| --- | --- |
| ChatGPT web to Secure MCP Tunnel | Your working account/workspace connection and tunnel access controls |
| Tunnel client to 127.0.0.1:8787/mcp | Private learning tools; loopback only; no public listener |
| Laptop to Supermemory | Separate public-client OAuth flow with PKCE and a local callback |
| leetcode_problems | Primary memory space for brief approved observations and recall reviews |
| leetcode | Additional read-only retrieval of previous DSA context |
| Local persistent ledger | Structured events, revision schedules, source evidence and idempotency receipts |
| LeetCode Codeforces GitHub | On-demand public evidence; partial coverage is reported |

Unrelated spaces are excluded by default; additional DSA read spaces require an explicit configured allowlist. The server never copies every chat or treats free-form memory as verified acceptance or mastery. The ledger is necessary for exact schedules and duplicate prevention; Supermemory provides semantic context and stored recovery envelopes.

## Authentication boundaries

No OAuth is required in the ChatGPT custom MCP form for this local tunnel mode. This does not make the system publicly anonymous: OpenAI controls access to the tunnel, and the MCP process accepts only the configured loopback origin. Use a dedicated personal tunnel restricted to the intended account/workspace. Anyone authorized to call this tunnel can use its one configured learning owner; this mode is not a multi-user authorization system.

Supermemory login is independent. It uses a public PKCE client, verifies the configured owner and primary space, and saves tokens only after verification. The callback is http://127.0.0.1:8788/callback and is not exposed through the MCP tunnel. Live provider acceptance of this loopback callback remains to be tested. If registration or sign-in fails, stop and report the provider error without sharing credentials; do not disable account checks or substitute mock tokens.

Tokens stay in a mode-0600 file under a mode-0700 local state directory, outside the repository. The file is not encrypted at rest; the laptop account and disk security protect it. Do not upload or commit that directory. Refreshes serialize and persist rotated tokens. The tunnel's OpenAI runtime API key stays in the tunnel client's secure local environment; this application neither reads nor saves it.

## One-time local setup

Use Node.js 24 and the repository's existing feature branch. From mcp-worker:

```sh
npm ci --no-audit --no-fund
npm run verify:local
npm run memory:login -- YOUR_SUPERMEMORY_USER_ID
```

Use the intended account's userId from Supermemory's who_am_i tool, not its email. Open http://127.0.0.1:8788 on the same laptop, select Continue to Supermemory and complete sign-in. A success page appears only after owner and space verification. No password or API key is entered into our page. This sign-in must run on your laptop; a localhost URL in this build workspace would not point at it.

Start read-only first:

```sh
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID
```

The process refuses to start without verified, usable credentials. Once connected, explicit write opt-in is:

```sh
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID --allow-writes
```

Stop the earlier process before restarting. Opt-in enables only brief learning observations and recall reviews; the tutor must still obtain agreement before each save. There is no generic delete tool. Explicit monitoring can index saved question candidates without inventing performance records. Learning improvements are new observations in the history, not overwrites of earlier attempts. Do not save synthetic test performance in the real learning ledger.

Before testing through ChatGPT, run `npm run tunnel:doctor` in a second terminal.
It initializes an actual SDK client, checks the real learning-tool inventory and
calls the read tools, including bounded Supermemory retrieval, without saving
learning observations. A local PASS does not prove the tunnel or Go connection.
See [the complete local validation sequence](LOCAL_VALIDATION.md) for diagnosis,
the corrected Go prompt, and the later hosted migration gates.

## Reuse the existing tunnel

Keep the existing tunnel identity and restricted runtime key. Do not create another tunnel or change account plans. Locate the installed official tunnel-client binary and run its current quickstart help. These commands create a separate local profile pointing the existing tunnel at the learning server, rather than the report's mock port 8000:

```sh
tunnel-client help quickstart
tunnel-client init --sample sample_mcp_remote_no_auth --profile coding-intuition-local --tunnel-id "$CONTROL_PLANE_TUNNEL_ID" --mcp-server-url http://127.0.0.1:8787/mcp
tunnel-client doctor --profile coding-intuition-local --explain
tunnel-client run --profile coding-intuition-local
```

Use the binary's real path if it is not on PATH. Reuse the local environment variable references for tunnel ID and runtime key; never paste actual keys into chat or command arguments. Only run the intended profile for a tunnel while testing; stop the mock client first so it cannot receive learning requests.

In ChatGPT web, select the existing tunnel, choose no OAuth for this local MCP connection, and refresh or recreate the plugin so it discovers the real learning tools. Review the tool list before use. The local server, tunnel client, internet connection and awake laptop must remain available during tool calls.

See [the expanding adaptive workflow](ADAPTIVE_WORKFLOW.md) for new GitHub/profile problems and questions outside the 188-problem seed.

## Learning-flow smoke test

1. Start a ChatGPT web conversation and select the learning plugin. Ask for recommendations and due reviews. The tutor retrieves relevant memory before coaching and starts with gentle hints.
2. Solve and explain in ChatGPT. Public accepted submissions, GitHub code and self-reported understanding remain distinct evidence.
3. After a meaningful attempt, the tutor offers a brief reasoning observation. Once approved, it calls record_reasoning_event. A learner-confirmed recall grade uses record_review.
4. Reuse clientEventId for retries. If a write reports pending, reconcile documents with refresh_learning_memory before retrying; never generate a new ID to force a second write.
5. For a new chat, select the plugin again when new data or actions are needed. Memory persists through tools; the MCP does not automatically read other conversations.

The model does not retrain itself. Adaptation means future context retrieval, weakness ranking and revision schedules change as valid observations accumulate. Saved files survive process restarts. If the laptop sleeps or the process stops, the tunnel cannot call tools; unsaved chat activity is not captured later automatically.

## Verification and remaining gates

Local tests use a simulated Supermemory provider. They cover the original hosted OAuth flow and the private tunnel mode, owner and space checks, refresh rotation, private credential files, real loopback startup, input boundaries, caching, recovery and persistent learning events.

Still required on the laptop: real Supermemory public-client registration and browser consent, owner and space verification, tunnel doctor, real ChatGPT learning tool discovery, memory retrieval, one approved observation, and read-back after restart. Do not call the complete integration live before these pass. No cloud deployment is required for this local route.

## Limits and costs

No model inference or embeddings API is used. Optional monitoring performs bounded periodic source and document reads using Durable Object alarms. The tunnel needs an OpenAI runtime API key for tunnel access; this is distinct from making billable model API requests. Provider billing and quotas still apply; this implementation does not guarantee unlimited or free tunnel traffic. Supermemory account limits and ChatGPT Go limits remain independent. Memory searches return at most six excerpts of 1,200 characters each and cache for one hour; source sync is on demand and cached for ten minutes.

Official tunnel guide: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
