# Intuition learning pipeline — implementation slice 1

## Architecture
ChatGPT MCP / authenticated app -> validated structured learning event -> PostgreSQL \`learning_events\` (per-user RLS, append-only, idempotent) -> explicit weakness signals -> concept graph + existing SRS / accepted submission evidence -> ranked questions and unfamiliar transfer tasks -> repeat independent check.

## Ground truth
- A LeetCode/Codeforces accepted verdict is external solve evidence; GitHub files are code-location evidence, not accepted verdicts.
- A user's description of their own thought process, hint need, invariant, counterexample, or alternate approach is self-reported reasoning evidence, **not** automatic mastery or a model-training example.
- Curriculum title/idea text is heuristic concept metadata; \`concept-graph.ts\` labels connections \`curriculum-heuristic\` and never infers that the user understands the concept.
- ChatGPT message attachments and conversations are **not passively available to external MCP**. The assistant must call \`record_reasoning_event\` with a brief user-approved structured observation (never raw whole chats), once the ChatGPT OAuth connection works.

## ETL stages
1. Extract: explicit structured event with a stable problem key (\`itemId\` or \`lc:98\`/\`cf:123A\`/\`manual:...\`) and client event id.
2. Validate: strict event categories, timestamps set by server, summaries capped at 700 characters, known concept keys, no arbitrary unknown JSON.
3. Load: authenticated per-user insert with unique \`(user_id,client_event_id)\` and immutable rows; retries idempotent.
4. Transform: group verified review grades, mistake labels, hint dependence, due dates and *self-reported* reasoning events. Do not overwrite curriculum, progress or platform verdicts.
5. Serve: one shared Postgres view of learning history to web UI and ChatGPT MCP; show explanation and evidence provenance.
6. Evaluate: use delayed independent transfer to validate intuition, not just solve counts.

## Technique network
Curated directed questions connect hashing and two pointers, prefix sums and window monotonicity, recursion and DFS/backtracking, BFS vs DFS, greedy vs DP, etc. Candidate relationships are approximate until checked by a learner.

## Low-cost controls
No Lovable-agent call, Vercel build/deployment, external LLM inference, or Supermemory bulk indexing in the CI slice. GH Actions builds and deterministic unit tests run on the feature PR. Do not merge or deploy until authenticated MCP write/read, migrations, replay, user isolation, source sync, and OAuth integration are proven in staging.

## Remaining work
Read/write MCP wiring, frontend review capture, ChatGPT OAuth flow, real LeetCode/Codeforces counts, GitHub solution matching, migrations in Lovable Cloud, end-to-end browser validation, versioned model rubric and observability.
