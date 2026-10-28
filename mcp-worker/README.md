# Coding Intuition MCP

Coding Intuition is a local MCP server for DSA learning. It gives ChatGPT tools for a roadmap, problem history, evidence-based practice recommendations, review scheduling, and explicitly approved learning observations. It uses Supermemory for semantic learning context and a local durable ledger for structured records.

## Local quick start

Requirements: Node.js 24, npm, a Supermemory account that owns the `leetcode_problems` space, and (only if connecting ChatGPT to your laptop) an OpenAI Secure MCP Tunnel client/account that supports MCP tunnels.

From the repository root:

```sh
git clone --branch feature/evidence-intelligence-layer https://github.com/suvitkankariya2007-debug/coding-intuition-learning-os.git
cd coding-intuition-learning-os/mcp-worker
npm ci --no-audit --no-fund
npm run verify:local
```

The verification command runs TypeScript checks, builds dry-run bundles, and executes the automated suite against a simulated Supermemory provider. It does not sign in to Supermemory, start a persistent server, deploy to Cloudflare, or prove a ChatGPT account connection.

### Connect your own Supermemory account

Use the Supermemory user ID from that account's `who_am_i` result (never an API key):

```sh
npm run memory:login -- YOUR_SUPERMEMORY_USER_ID
```

Open the loopback sign-in page shown by the command and complete Supermemory authorization. The login verifies the owner and required private space. Credentials are kept outside the repository in a private local state directory.

Start the MCP read-only by default:

```sh
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID
```

To connect ChatGPT web, run your own Secure MCP Tunnel client pointed at `http://127.0.0.1:8787/mcp`, then select that tunnel in ChatGPT. Do not expose port 8787 publicly. Keep both the MCP process and tunnel client running, and keep the laptop awake while using this local setup. See [LOCAL_TUNNEL.md](LOCAL_TUNNEL.md) for tunnel installation and account-specific setup.

Writes are off by default. If you deliberately want to test approved learning writes, stop the read-only server and restart with `--allow-writes`; still approve each learning observation in the conversation. Never use synthetic reviews or write data you do not intend to keep.

## What is and isn't verified

The current local source suite has passed 132 automated tests in the development workspace. These tests use simulated upstream services. They cover local runtime startup, OAuth security behavior, recommendation arithmetic, one-hour search caching, and write reconciliation.

A successful test suite is not proof of real Supermemory authorization or a successful ChatGPT Go/Plus tool call. Each tester must authenticate their own Supermemory account and verify a read-only tool such as `get_roadmap`. The MCP cannot read every ChatGPT conversation on its own; ChatGPT must supply relevant visible context. This project does not fine-tune ChatGPT.

LeetCode, Codeforces, and GitHub sources are public/profile-based and coverage is partial; source records are not automatically treated as accepted solutions or mastery. Search caches expire after one hour; confirmed writes or explicit refresh can invalidate them earlier.

## Hosted deployment

Hosted Cloudflare deployment is a separate configuration path; it is not required for this local test. Do not use the repository's template Wrangler config as a live deployment. For a hosted instance, configure your own Worker, KV namespace, OAuth client, and secrets, then follow [LIVE_GO_VERIFICATION.md](LIVE_GO_VERIFICATION.md). Do not commit secrets, token files, `wrangler.local.jsonc`, or personal learning data.
