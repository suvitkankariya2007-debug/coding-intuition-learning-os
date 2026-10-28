# Run Coding Intuition locally through a Secure MCP Tunnel

This guide runs the learning MCP on your laptop and connects a compatible ChatGPT web account through the OpenAI Secure MCP Tunnel client. It does not deploy the Worker. Keep the laptop awake and both Terminal 1 and Terminal 2 running while you use the local connection.

The local MCP uses your own Supermemory authorization. The automated tests use simulated services and do not establish a live ChatGPT or Supermemory connection.

## Requirements

- Node.js 24 and npm.
- A Supermemory account that owns or can access the required leetcode_problems space.
- The official Secure MCP Tunnel client, an existing tunnel identity, and a supported ChatGPT account/workspace.
- Access to this repository. It is currently private; users without access cannot clone it.

Use the Supermemory user ID from that account's who_am_i result. Never use an API key in place of the user ID, and never share runtime keys or credential files.

## 1. Prepare the local server

From Terminal 1:

~~~sh
cd ~/coding-intuition-learning-os/mcp-worker
npm ci --no-audit --no-fund
npm run verify:local
npm run memory:login -- YOUR_SUPERMEMORY_USER_ID
~~~

Open the local URL printed by memory:login on the same laptop and finish sign-in with Supermemory. Continue only after the page confirms that the configured account and required space match. The saved token file is outside the repository; do not upload or commit it.

If you have already completed login for this owner on this laptop, do not repeat it unless the credentials are missing or expired.

## 2. Start Terminal 1

Start read-only first:

~~~sh
npm run build:tunnel
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID
~~~

The server should report that it is listening at http://127.0.0.1:8787/mcp and that writes are disabled.

Learning writes are optional and off by default. Only when you intend to save genuine learner-approved observations or confirmed recall grades, stop the read-only process with Ctrl+C and restart it as:

~~~sh
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID --allow-writes
~~~

This enables the learning write tools; it does not itself create a write. The learner must still approve each observation, and a recall grade must come from a real attempt.

## 3. Start Terminal 2

Use the official tunnel-client binary and the existing private tunnel identity. Do not paste the runtime key into a command line or chat. Enter it locally into the environment:

~~~sh
read -r -s -p 'Tunnel runtime key: ' CONTROL_PLANE_API_KEY
printf '\n'
export CONTROL_PLANE_API_KEY
read -r -p 'Tunnel ID: ' CONTROL_PLANE_TUNNEL_ID
export CONTROL_PLANE_TUNNEL_ID
~~~

From the directory containing your tunnel-client binary, create or update a profile aimed at the local MCP:

~~~sh
./tunnel-client init --sample sample_mcp_remote_no_auth --profile coding-intuition-local --tunnel-id "$CONTROL_PLANE_TUNNEL_ID" --mcp-server-url http://127.0.0.1:8787/mcp
./tunnel-client doctor --profile coding-intuition-local --explain
./tunnel-client run --profile coding-intuition-local
~~~

If your installed client version uses different flags, check its local help and keep the same target URL. Stop any old test/mock tunnel client using this same tunnel identity before starting the new profile; never stop unrelated tunnel processes.

## 4. Check the local endpoint

While Terminal 1 is running, open a third terminal in mcp-worker and run:

~~~sh
node local/doctor.mjs
~~~

It makes read-only calls to the local server, checks the current 37-tool inventory and probes learning data. A PASS is evidence about that local endpoint and its authorized account only. It does not show which server ChatGPT selected.

## 5. Connect the ChatGPT client

In ChatGPT, select the existing Secure MCP Tunnel connection/profile that Terminal 2 is running. Refresh tool discovery, then open a new chat and choose the Coding Intuition tools. Do not configure this private local tunnel as a public Server URL or use hosted OAuth for it.

First verify that the available tools include get_roadmap, get_memory_patterns, get_recommendations, get_problem_history, and get_due_reviews. Then call a read-only tool such as get_roadmap or get_recommendations. If only Mock_MCP_E2E tools appear, stop: ChatGPT is using stale discovery or the wrong tunnel profile.

A successful call inside ChatGPT is the evidence that its account reached this local server. Local tests, the tunnel-client doctor, and a separate Supermemory plugin are not substitutes.

## Data and operating limits

- Only the configured owner uses this single-user local server; it is not a multi-user authorization service.
- The MCP cannot read other ChatGPT chats unless ChatGPT supplies relevant context in a tool call.
- Public LeetCode, Codeforces, and GitHub coverage is bounded and reported as partial where applicable.
- GitHub code is retrieved at a pinned revision and is not executed or treated as an accepted verdict.
- Recommendations are heuristic practice priorities, not proficiency grades or solve probabilities.
- The learner ledger and Supermemory remain on the configured local/upstream services. The tunnel does not make the server public.
- No unlimited-use claim is made; OpenAI tunnel, ChatGPT, Supermemory and source-provider limits apply.

## Separate hosted status

The Cloudflare Worker deployment is a separate connection path. A deployment and public endpoint check do not prove that hosted OAuth succeeds in ChatGPT. Use this local guide only for the tunnel route and assess hosted authorization separately.
