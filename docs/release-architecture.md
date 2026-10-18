# Coding Intuition Learning OS — Release Architecture

## Data ownership
- **Supermemory:** source of learner-approved intuition, misconceptions, alternative approaches and hint preferences. Retrieval is targeted to the explicit \`leetcode_problems\` namespace. Do not automatically import other spaces without permission.
- **Existing Supabase/PostgreSQL:** factual 188-item active roadmap, verified platform evidence, dated revision logs and small structured event ledger. No new paid database service.
- **LeetCode/Codeforces/GitHub:** source-specific, provenance-tagged submissions and solution files. A GitHub code file is not an accepted LeetCode submission.
- **ChatGPT custom MCP:** exposes authenticated roadmap, hints, concepts, progress, and bounded learner-approved reasoning summaries. The existing bearer JWT is NOT an OAuth authorization server.

## Flow
\`\`\`
ChatGPT/Go -> OAuth authorization + account linking [NOT IMPLEMENTED]
                     -> HTTPS MCP -> authenticated tools -> learning fabric
Supermemory -> targeted retrieval -> per-user TTL cache + concurrent-call coalescing
            -> optional provider cursor/revision feed [NOT IMPLEMENTED]
            -> incremental version reconciliation -> concept signals
LeetCode/Codeforces -> paginated accepted evidence [NOT COMPLETE]
GitHub -> indexed code solutions [NOT COMPLETE]
Existing Supabase -> 188 active roadmap + evidence + SRS revision schedule
Learning fabric -> misconception signals -> transfer graph -> personalized next task
\`\`\`

## Cost and usage controls
- No paid model inference or scheduled full-memory scans.
- Search limit 5; per-user/query TTL cache; in-flight request coalescing.
- Incremental reconciler only accepts provider revisions and does not falsely mark partial pages as complete.
- No Lovable agent invocations or production Vercel deployment until release gates pass.
- Serverless in-memory cache is per-instance and ephemeral; **not** a durable distributed cache. Provider API quotas and Vercel usage are still possible.

## Release gates
1. GitHub unit/integration tests and app build pass on the exact commit.
2. OAuth authorization server or supported identity provider is implemented with discovery, PKCE, consent, token issuance/verification, refresh/revocation where applicable, and Go-account login test. **Not implemented**.
3. MCP HTTPS endpoint is publicly reachable; protocol initialize, tools/list and authorized tool calls verified.
4. Supermemory API endpoint, credentials, namespace/user mapping and provider response schema verified against a real authorized account. **Not verified**.
5. Full distinct accepted-problem counts, GitHub deduplication, and cold-start recommendations verified. **Not complete**.
6. One budget-controlled preview build, then production release only after authenticated end-to-end verification.

## Test boundary
The integration suite tests deterministic cross-component behavior using mocks. Passing it does not prove OAuth, Supermemory provider, LeetCode API or Vercel live connectivity.
