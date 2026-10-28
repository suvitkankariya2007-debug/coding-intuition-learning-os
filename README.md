# Coding Intuition Learning OS

Coding Intuition is a DSA learning project with a web application and a separate local MCP server.

## What the local MCP does

It connects a compatible AI client to the learner's own Supermemory context and a durable structured learning ledger. Its tools provide a stable 188-problem roadmap and an expanded catalog, history and due reviews, transparent evidence-linked recommendations, progressive hints, concept connections and transfer practice, approved reasoning observations, learner preferences, and cross-chat question continuity.

This is useful for making practice follow from the current problem and the learner's recorded questions and attempts. Recommendation scores are heuristic practice priorities, not proficiency grades or predictions. The MCP cannot read unseen conversations; the AI client must supply relevant context. It does not fine-tune a model.

## Run the MCP locally

Start with the [MCP README](mcp-worker/README.md) and [two-terminal tunnel guide](mcp-worker/LOCAL_TUNNEL.md). The local server runs on loopback and connects to each tester's own Supermemory account. Writes are disabled by default and still require learner approval.

~~~sh
cd mcp-worker
npm ci --no-audit --no-fund
npm run verify:local
~~~

The current development checkout passed 132 automated tests. Tests use simulated upstream services and do not prove real Supermemory authorization, an authenticated ChatGPT call, or a successful live write/read-back. Follow [the local validation checklist](mcp-worker/LOCAL_VALIDATION.md) to keep those checks separate.

The Cloudflare Worker has a deployment, but its authenticated ChatGPT OAuth path has not been verified end-to-end. Local tunnel setup is a separate route and does not rely on Cloudflare.

## Repository access

This repository is currently private. External testers need access from the owner before they can clone it. Do not present the clone instructions as publicly available while the repository remains private.

## Web application

The web app was originally built with [Lovable](https://lovable.dev).

**Live app:** https://coding-intuition-learning-os.lovable.app
