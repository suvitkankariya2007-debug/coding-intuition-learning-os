# Remaining checks and current evidence

Deployment and merge remain paused. Test results from isolated providers are
not proof of live account access or production operation.

## Completed automatically

- TypeScript/native-script syntax and both non-deploying Worker bundles.
- 73 automated cases covering local and OAuth runtimes, owner/scope boundaries,
  memory pagination and recovery, actual alarms, source failures, persistence,
  idempotency, source attribution and evidence-based ranking.
- Background simulation: explicit truncated-memory PARTIAL; recovery after complete
  provider content; source outage/backoff; source recovery; persisted alarm firing
  after restart; stopping. See demo/background-simulation.json.
- Rolling LeetCode windows accumulate records beyond 20; duplicates are prevented.
- Stale, missing, incomplete or failed evidence cannot pass the live verifier.

## Required live checks still unverified here

1. Updated laptop runtime: pull the feature branch, rebuild and restart. Run
   npm run verify:live. This must read an actual nonempty saved discussion fully
   and see fresh successful results for each expected monitor task.
2. Updated Go connection: refresh the existing connection's 24 tools and execute
   the prompt in LIVE_GO_VERIFICATION.md. Capture actual Go tool-call evidence.
3. Real approved learning write/review: preserve the returned receipt and confirm
   read-back in a fresh chat after restart. Earlier prompt passes were user-reported;
   full evidence has not been independently reviewed in this workspace.
4. Real polling interval: inspect success across ordinary 30-minute cycles and
   a restart without re-enabling monitoring. Fast isolated alarms verify the
   scheduler logic, but do not establish a long-running laptop/provider session.
5. After later deployment authorization: hosted offline OAuth/token refresh,
   secret configuration, migration and count comparison, scope/revocation checks,
   fresh Go discovery, actual read/write/read-back, then laptop-off operation.
   These checks cannot be executed before deployment and owner authorization.

## Expected partial coverage, not a hidden successful test

- A real Supermemory contentTruncated response needs the complete source to be
  saved or supplied upstream. The MCP cannot reconstruct text absent from it.
- Only notes/discussions actually saved in Supermemory are available; no automatic
  importer of all unseen ChatGPT conversations has been configured.
- LeetCode public retrieval is the newest 20 accepted submissions per poll. This
  window moves and the ledger accumulates; older unseen history and gaps exceeding
  the window need a separately authorized history import.
- Literal question extraction is a heuristic; learners confirm any structured
  diagnosis or recall grade. Algorithmic acceptance does not prove independent
  understanding.
- Recommendation effectiveness must be assessed from genuine future attempts,
  recall and transfer results. Passing software tests alone does not prove a
  learning improvement.

## If verification reports partial or fail

- Missing tools: restart the updated server and refresh Go's existing discovery.
- Disabled monitor: npm run monitor:start on the authenticated running server.
- Missing tasks: allow its first staggered cycle to finish; inspect status.
- partial_indexing: continue the memory scan, retaining its cursor; it must not
  be relabeled as complete before the entire inventory finishes.
- partial_provider_truncation: supply complete content upstream and let the
  next memory pass retry it.
- failed_reconnect_or_retry: inspect source availability or complete Supermemory
  sign-in; automatic backoff continues, and successful retries update status.
- Old successful timestamps: they remain historical evidence, not a fresh pass.
- Go remains unverified until its actual tool-call report is available, regardless
  of the result from the local SDK checker.
