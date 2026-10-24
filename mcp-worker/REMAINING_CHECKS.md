# Remaining checks and current evidence

Deployment and merge remain paused. Test results from isolated providers are
not proof of live account access or production operation.

## Completed automatically

- TypeScript/native-script syntax and both non-deploying Worker bundles.
- 109 automated cases covering local and OAuth runtimes, owner/scope boundaries,
  memory pagination and recovery, actual alarms, source failures, persistence,
  idempotency, source attribution and evidence-based ranking.
- Background simulation: explicit truncated-memory PARTIAL; recovery after complete
  provider content; source outage/backoff; source recovery; persisted alarm firing
  after restart; stopping. See demo/background-simulation.json.
- Rolling LeetCode windows accumulate records beyond 20; duplicates are prevented.
- Stale, missing, incomplete or failed evidence cannot pass the live verifier.
- Isolated full learning cycle: source and discussion retrieval, approved fixture
  reasoning observation, diagnosis and ranking update, recall-grade scheduling,
  duplicate/conflict handling, local restart and recovery from saved memory.
  This uses fixture observations and proves software behavior only.
- Reasoning diagnoses now include explicit approved mistakes, and explicitly
  tagged new-problem difficulties affect ranking without guessing from titles.
- Reviews return attributable receipts and remain identifiable after recovery.
- Object tool results provide both readable text JSON and structuredContent.
  This improves client compatibility; actual Go readability still needs retesting.

## Required live checks still unverified here

1. Updated laptop runtime: pull the feature branch, rebuild and restart. Run
   npm run verify:live. This must read an actual nonempty saved discussion fully
   verify commit-pinned GitHub code and see fresh successful results for each expected monitor task.
2. Updated Go connection: refresh the existing connection's 31 tools and execute
   the prompt in LIVE_GO_VERIFICATION.md. Capture actual Go tool-call evidence.
3. Real approved learning write/review: preserve the returned receipt and confirm
   read-back in a fresh chat after restart. Earlier prompt passes were user-reported;
   the screenshots explicitly show both writes pending. Complete the genuine
   attempt/consent/grade flow in LIVE_GO_VERIFICATION.md, then use verify:learning
   with the returned IDs for read-only restart verification.
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

## Recommendation acceptance update

See RECOMMENDATION_ACCEPTANCE.md for same-version, same-focus baseline tests,
valid event tags, a genuine recall/improvement cycle, restart readback and a
new-pattern update. Source-only items receive conservative scores; saved
historical mistakes and active weakness pressure are distinguished.

## Discussion-to-practice review

The 25th tool, review_learning_discussion, returns quoted doubts, key concepts,
common pitfalls, fallback approaches, review reasons and real platform catalog
problems without saving proposed observations. Saved excerpts are checked
against exact versions/offsets. See DISCUSSION_REVIEW.md for the Go prompt and
current-chat access limitations.

Cross-chat continuity now has versioned durable question records and full-payload write queuing. Search TTL is one hour; records do not expire. Automated fixtures cover independent questions, concurrent revision conflicts, restart/outage recovery and response-lost reconciliation. Refresh Go discovery to 31 tools and run the real-question workflow in CROSS_CHAT_CONTINUITY.md. A provider write with an ambiguous outcome remains pending until reconciliation finds it; automatic blind resends are disabled. An acknowledged targeted resend is available only after a complete nontruncated absence scan. Actual Go continuity, real account recovery and hosted laptop-off operation remain live gates.

## Learner profiles and multi-user adaptation

Implemented: 31 tools; versioned explicit preferences with immutable history and revision protection; continuously derived knowledge/hint/recall signals; bounded preference-based ranking and session-size policy; durable profile writes and recovery; per-account OAuth/namespace/cache/ledger isolation; per-learner source accounts, source-change archival and cursor reset; tenant-bound monitor credential encryption. Hosted multi-user mode is opt-in and requires each learner to prepare the displayed private Supermemory namespace. The single-user tunnel remains private.

Profile and isolation fixtures cover actual OAuth connections for two simulated users, different presentation/practice policies, no owner-handle inheritance, cross-account document/argument rejection, encrypted-token boundaries, background source selection, profile outage/restart/reconciliation, out-of-order queued revisions, history pagination and invalid inputs. Actual hosted onboarding with two real accounts and educational-effectiveness tests remain live gates. This work does not import or train on all previous chats. See LEARNER_PROFILES.md for setup and real-account prompts.
