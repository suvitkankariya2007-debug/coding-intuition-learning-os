# Coding Intuition MCP

Coding Intuition is a local-first MCP learning assistant for data structures and algorithms. It connects an AI client to a learner's own Supermemory context and a small durable learning ledger, then uses actual reasoning observations, recall reviews, and public coding-profile evidence to guide practice.

It is useful when a learner wants practice to follow from what they are currently working through and what they have previously found difficult. It does not read unseen chats, infer mastery from a code file, or train a model.

## Features

- A stable 188-problem roadmap plus an expanded catalog of newer LeetCode, Codeforces, GitHub, and learner-proposed problems.
- Evidence-linked recommendations with visible score components and arithmetic. Temporary discussion relevance is limited to the same problem, curated transfers, or specific shared concepts.
- Problem history, weaknesses, concept links, transfer practice, progressive hints, and spaced-recall reviews.
- Optional Supermemory retrieval and approved, brief learning observations with write receipts and duplicate-safe retries.
- Saved-question continuity, learner preferences, source coverage, and optional background monitoring.
- A local Secure MCP Tunnel mode, so a tester can keep the server on their own laptop and connect a compatible ChatGPT web account without deploying a Worker.

## Local quick start

Requirements: Node.js 24, npm, a Supermemory account with access to the leetcode_problems space, and—when using ChatGPT web—the official Secure MCP Tunnel client and an account that supports it.

Clone the feature branch containing the MCP:

~~~sh
git clone --branch feature/evidence-intelligence-layer https://github.com/suvitkankariya2007-debug/coding-intuition-learning-os.git
cd coding-intuition-learning-os/mcp-worker
npm ci --no-audit --no-fund
npm run verify:local
~~~

The automated check runs type checking, dry-run Worker builds, and tests using a simulated upstream. It does not sign in, write to a real memory account, prove ChatGPT connectivity, or deploy anything.

### Connect your own Supermemory

Use the user ID returned by who_am_i for the account that owns the learning space. Do not use an API key or copy the maintainer's ID.

~~~sh
npm run memory:login -- YOUR_SUPERMEMORY_USER_ID
~~~

Open the loopback URL printed by the command on the same laptop and finish Supermemory consent. The local app checks the account and required space, then keeps its tokens in a private local state directory outside this repository. Never commit or share that directory.

### Run locally

Terminal 1, from mcp-worker:

~~~sh
npm run build:tunnel
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID
~~~

The server listens only on 127.0.0.1:8787/mcp. Writes are disabled by default. To enable the narrowly scoped learning-write tools after reviewing the prompts, stop the server and explicitly restart it with --allow-writes. Each record still requires real learner consent and evidence.

Terminal 2: start the official tunnel-client with your existing private tunnel identity/profile, configured to forward to:

~~~text
http://127.0.0.1:8787/mcp
~~~

Keep both processes, your internet connection, and the laptop awake while testing. In ChatGPT, select the same tunnel connection and refresh tool discovery. For exact account-specific client commands, see LOCAL_TUNNEL.md.

## Verify

~~~sh
npm run verify:local
~~~

For a live local-account read check, first complete Supermemory sign-in and start Terminal 1, then run:

~~~sh
node local/doctor.mjs
~~~

The current source advertises 37 learning tools. The doctor checks the actual local endpoint, expected tool inventory, and read-only learning calls. It never verifies which endpoint ChatGPT selected. A separate successful read-only call inside ChatGPT is required to establish that client connection.

The automated suite uses simulated upstream services. It is not proof of real Supermemory authorization, ChatGPT Go/Plus access, or a live write/read-back cycle. Use only a genuine observation with explicit learner approval for live write testing; never create synthetic mastery or recall grades.

## Data, privacy, and limits

Supermemory provides bounded learning-context retrieval. A local persistent ledger supports structured observations, review schedules, source metadata, and idempotency receipts. Raw chats, screenshots, and the full Supermemory corpus are not copied into the ledger. Memory context is not proof of acceptance or mastery.

LeetCode and Codeforces data are public/profile-based and coverage is partial. GitHub code is retrieved at a pinned commit but is not executed and does not establish an accepted submission. Recommendation scores are transparent practice-priority heuristics, not grades or solve probabilities. The software does not fine-tune ChatGPT or access chats the AI client has not supplied.

## Hosted deployment

A Cloudflare Worker deployment exists, but the live ChatGPT OAuth connection has not been verified end-to-end. The local tunnel is a separate path and does not depend on Cloudflare. Hosted setup, live OAuth, and real-account acceptance results must be evaluated separately; do not treat simulated tests or public discovery checks as proof of a successful authenticated client call.

## Repository access

This repository is currently private. People outside its owner/collaborators cannot clone it until the owner changes repository visibility or grants access. Do not advertise the clone command as open to everyone while it is private.

The original web app is available at https://coding-intuition-learning-os.lovable.app. The web app and local MCP have separate setup and verification paths.
