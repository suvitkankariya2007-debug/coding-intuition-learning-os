# Validate the real learning MCP, not the old mock

The October 20 Go report lists `Mock_MCP_E2E` tools and HTTP `UNAVAILABLE`.
That is evidence about the old mock connection, not this server. A successful
separate Supermemory connector call also does not test this application.

See [the expanding learning workflow](ADAPTIVE_WORKFLOW.md) for newer problems, code discussion, profile refresh and configured memory spaces.

The learning server identifies itself as `coding-intuition-learning` and exposes
18 tools. In particular, expect `get_roadmap`, `get_memory_patterns`,
`get_recommendations`, `record_reasoning_event`, and `record_review`.
Do not proceed with learning writes while only mock tools are visible.

## Local sequence (no deployment)

1. Pull the existing feature branch and run `npm run verify:local` in
   `mcp-worker`. This rebuilds both bundles and tests against a simulated provider.
2. Keep the successful Supermemory login. The argument to `memory:login` and
   `tunnel:serve` is your Supermemory **user ID**, not any API key. Only rerun
   `npm run memory:login -- YOUR_SUPERMEMORY_USER_ID` if authorization is missing.
3. Start `npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID` and leave it running.
   Start read-only; `--allow-writes` is a later explicit opt-in.
4. In a second terminal run `npm run tunnel:doctor`. It performs an initialized
   SDK handshake, checks the actual 18-tool inventory, and calls the 14 read
   tools, including bounded Supermemory retrieval. It prints status, not private
   memory text or credentials. Empty memory results do not prove your existing
   memories were retrieved: inspect the results in ChatGPT separately.
5. Stop any old mock `tunnel-client` process using the same tunnel ID. Multiple
   clients for the same tunnel can consume requests; changing a profile alone
   does not stop an already running mock client. Do not stop unrelated tunnels.
6. In the extracted official client directory, use the existing tunnel ID and a
   replacement restricted runtime key entered locally (never paste it here):

```sh
read -r -p 'Existing tunnel ID: ' CONTROL_PLANE_TUNNEL_ID
export CONTROL_PLANE_TUNNEL_ID
read -r -s -p 'Runtime API key: ' CONTROL_PLANE_API_KEY
printf '\n'
export CONTROL_PLANE_API_KEY
./tunnel-client init --sample sample_mcp_remote_no_auth --profile coding-intuition-local --tunnel-id "$CONTROL_PLANE_TUNNEL_ID" --mcp-server-url http://127.0.0.1:8787/mcp
./tunnel-client doctor --profile coding-intuition-local --explain
./tunnel-client run --profile coding-intuition-local
```

7. Refresh the tools on the existing ChatGPT connection using this same tunnel.
   If its UI cannot refresh discovery, replace only that custom connection;
   do not create another tunnel or server process. Use no downstream OAuth only
   for this private local mode. The hosted entrypoint requires OAuth.
8. Use a new chat with the refreshed custom learning MCP selected. Run the
   read-only prompt below. Do not substitute a direct Supermemory connector.

## Read-only Go validation prompt

```text
Validate my custom Coding Intuition learning MCP in this ChatGPT Go chat.
Do not use the separate Supermemory connector, deployment tools, or conversational
recall as proof. Do not write synthetic learning records.

First check available tools. Expect get_roadmap, get_memory_patterns,
get_recommendations, get_due_reviews, get_learning_signals,
get_progress_report, get_progressive_hint, record_reasoning_event, and
record_review. If only Mock_MCP_E2E tools are available, STOP and report
WRONG_OR_STALE_CONNECTION. Do not attempt mock record creation.

Call get_roadmap with limit 1; verify its total is 188 and obtain a real itemId.
Call get_progress_report, get_due_reviews, get_learning_signals, and
get_source_status. Report empty or partial state honestly.
Call get_memory_patterns with a query about my DSA teaching preferences.
Show the returned preference evidence and namespaces; if none, say none.
Call get_recommendations and check whether memoryContext is available.
Using the roadmap itemId, call get_problem_history, get_progressive_hint
(level 1), get_concept_connections, and get_transfer_problem.
Call diagnose_weaknesses. Base one brief teaching example on actual retrieved
preferences; distinguish evidence from your own teaching choices.

Return a compact table: tool | actual call result | PASS/FAIL/UNVERIFIED.
Redact credentials. Distinguish an empty valid result from a failed operation.
List available write tools but do not invoke them in this read-only test.
Do not fail the app for lacking generic update/delete tools: its learning ledger
records history, and later observations can record real improvement. Do not
claim mastery, accepted submissions, automatic cross-chat capture, write success,
background operation, unlimited Go usage, or deployment readiness from this test.
```

## Real approved write and persistence gates

After read checks pass, restart the local server with `--allow-writes`.
Use one **real** observation the learner agrees to save, not invented test
performance. `record_reasoning_event` needs `clientEventId`, `kind`, `summary`,
and `origin: chatgpt`; optional `itemId` must come from the real roadmap.
Read `get_learning_signals` and `get_recommendations` afterward. Repeat the same
write with the same exact ID and payload only to confirm idempotency. An
ambiguous/pending write must be reconciled with `refresh_learning_memory` first;
never change the event ID to force another write. Semantic search may index
asynchronously; the structured ledger and returned receipt are separate evidence.
A later real improvement is a new observation, not an overwrite of past history.

For reviews, use `record_review` only with a real roadmap itemId and the learner's
explicit grade from 0 to 5. Verify its returned next due date; a newly scheduled
future review should not be expected in today's due list.

Restart the server without deleting its state and verify the observation in a
new chat. Local SDK tests prove neither Go account access nor automatic tool
selection in ordinary conversations. Obtain each result before claiming it.

## Hosted switch (still paused)

Both entrypoints use the same MCP handler and 18 tools. The integration suite
runs the same initialized SDK read contract against local and OAuth-protected
hosted Workers, using a simulated upstream. It also tests write idempotency,
cache invalidation, OAuth boundaries, and persistence. No public deployment or
real hosted OAuth has been tested by that suite.

The hosted Worker uses a different persistent store from the laptop. Local data
files are not uploaded automatically. Recover approved structured learning
receipts from Supermemory with `refresh_learning_memory` until nextPage is null,
then compare counts and pending receipts before switching. Free-form preference
memories remain searchable and are not converted into mastery.

After later deployment authorization, verify public discovery, complete hosted
OAuth, refresh the existing ChatGPT connection to the hosted HTTPS endpoint,
repeat the same tool tests, reconcile learning state, and finally stop the local
processes and verify a fresh-chat read. Do not reuse no-auth local settings for
the public server. No laptop-off or deployment-readiness claim is made now.


## Startup troubleshooting after an update

Stop the old MCP and local login processes with Ctrl+C. In the existing checkout,
fetch and switch to feature/evidence-intelligence-layer, then pull with --ff-only.
Run npm run verify:local from mcp-worker once; this includes both dry-run builds
and creates dist-tunnel/tunnel.js. It does not deploy. No dependency reinstall is
needed when package-lock.json is unchanged and node_modules is already installed.

Run npm run memory:login -- YOUR_SUPERMEMORY_USER_ID. Open the fresh start page
http://127.0.0.1:8788, not an old /callback address. On failure the updated local
page and terminal show an allowlisted diagnostic code. Share that code only;
never share the callback URL, credential file, or provider response body. A
LOGIN_ISSUER failure needs provider compatibility investigation; retrying with
another account or removing issuer checks is not a fix. LOGIN_ACCOUNT means
that the browser signed in to a different account; LOGIN_SPACE means the account
does not expose the required space. OAuth HTTP codes identify registration vs
token exchange failures without exposing their contents.

After the success page, start npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID
--allow-writes. In a separate terminal run npm run tunnel:doctor. Only after PASS,
restart the installed tunnel-client with the existing coding-intuition-local
profile and existing tunnel ID. Run its doctor before run. Refresh the existing
ChatGPT connection and open a fresh Go chat; expect 18 learning tools. Keep the
MCP server and tunnel client running. Do not save synthetic reasoning or reviews.
