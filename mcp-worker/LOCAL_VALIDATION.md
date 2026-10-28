# Validate the local Coding Intuition MCP

This checklist separates automated tests, a live local Supermemory check, and an actual call from ChatGPT. Passing one does not imply the others passed.

The MCP source currently exposes 37 learning tools. Check the live inventory rather than relying on an old plugin listing or a tool count copied from an earlier build.

## 1. Automated source checks

From mcp-worker:

~~~sh
npm ci --no-audit --no-fund
npm run verify:local
~~~

This runs TypeScript validation, dry-run builds for the Worker and tunnel entrypoints, and the test suite with a simulated upstream. It does not authorize with a real Supermemory account, contact ChatGPT, write learning records, or deploy.

Record the exact test totals printed by your checkout. They can change when tests are added; avoid hard-coding an old total into reports.

## 2. Live local read check

Sign into the Supermemory account that owns or can access leetcode_problems:

~~~sh
npm run memory:login -- YOUR_SUPERMEMORY_USER_ID
~~~

Complete the browser flow on the same laptop. In Terminal 1, start the local server read-only:

~~~sh
npm run build:tunnel
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID
~~~

In a second terminal, run the local SDK doctor:

~~~sh
node local/doctor.mjs
~~~

It checks the server identity, full expected tool inventory and bounded read calls against the authenticated local server. It does not verify the tunnel or the ChatGPT account.

## 3. Verify the Secure MCP Tunnel and ChatGPT connection

In Terminal 2, use the installed official tunnel-client with the intended tunnel profile pointing to:

~~~text
http://127.0.0.1:8787/mcp
~~~

Run its doctor, then run the profile. Keep Terminal 1, Terminal 2, internet access and the laptop awake. In ChatGPT, choose that same tunnel connection, refresh tool discovery, and start a new chat.

Read-only validation prompt:

~~~text
Use the Coding Intuition tools selected in this chat. Do not use the separate
Supermemory connector. Do not create or modify learning records.

List the available tool names and verify that get_roadmap, get_recommendations,
get_problem_history, get_due_reviews, and get_memory_patterns are available.
Call get_roadmap with limit 1 and report its returned total and item ID. Call
get_recommendations with no context and report the actual engineRevision,
responseContractVersion, scoringVersion, and score arithmetic checks. Call
get_memory_patterns for a DSA learning preference and report the actual result,
including an empty result if none was found.

Mark each check PASS, FAIL, or UNVERIFIED based only on the returned tool
responses. If the tools are missing or only Mock_MCP_E2E is listed, stop and
report WRONG_OR_STALE_CONNECTION. Do not claim a successful ChatGPT connection
based on local tests or the separate Supermemory connector.
~~~

A successful tool response from the selected ChatGPT connection is the proof that this client reached the local MCP. A doctor PASS by itself is not.

## 4. Optional genuine write test

Keep writes disabled for ordinary read-only testing. For a real write-cycle test only, stop Terminal 1 and restart it with:

~~~sh
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID --allow-writes
~~~

Use a genuine learner attempt. Ask before recording one brief factual observation. For a review, use only the learner's actual recall grade from 0 to 5. Keep each returned event ID and receipt. Reuse the same ID and payload for an idempotency retry; reconcile a pending write before any retry. Then verify through history/read-back after restarting the server. Never create synthetic attempts or grades in the real account.

## Evidence boundaries

- Local tests use fixtures; they establish software behavior, not real-account authorization or educational outcomes.
- Local SDK calls establish the local endpoint and configured Supermemory authorization, not which endpoint ChatGPT selected.
- A ChatGPT read establishes client routing and tool availability, not successful writes, complete source history, or mastery.
- LeetCode, Codeforces and GitHub source coverage is bounded. Report its returned coverage instead of implying complete history.
- A Cloudflare deployment is a separate hosted route. Public discovery/health checks do not prove hosted OAuth or a successful authenticated ChatGPT call.

For client setup and terminal commands, see [LOCAL_TUNNEL.md](LOCAL_TUNNEL.md). For project overview and feature details, see [README.md](README.md).
