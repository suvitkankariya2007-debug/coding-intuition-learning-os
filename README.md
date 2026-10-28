# Coding Intuition Learning OS

Coding Intuition is a DSA learning project with two related parts: a web learning app and a separate local Model Context Protocol (MCP) server.

## Local MCP

The MCP connects a compatible AI client to a learner's own Supermemory context and a durable learning ledger. It supports a 188-problem roadmap plus an expanded catalog, evidence-linked practice recommendations, progressive hints, problem history, spaced-recall reviews, and explicitly approved learning observations.

The MCP code and setup guide are on the feature/evidence-intelligence-layer branch:

[Open the local MCP setup guide](https://github.com/suvitkankariya2007-debug/coding-intuition-learning-os/blob/feature/evidence-intelligence-layer/mcp-worker/README.md)

Quick check after cloning that branch:

~~~sh
cd mcp-worker
npm ci --no-audit --no-fund
npm run verify:local
~~~

The automated suite uses simulated upstream services; it does not prove real Supermemory sign-in, a ChatGPT tool call, a live learning write, or hosted OAuth. Follow the MCP guide for account-specific local setup and limits.

**Repository access:** the repository is currently private, so external readers need access from the owner before they can clone or run the project. Do not treat these instructions as a public download until repository visibility changes.

## Web application

The web app was originally developed with [Lovable](https://lovable.dev).

**Live app:** https://coding-intuition-learning-os.lovable.app

The web application and local MCP server have separate setup and verification paths.
