# Acceptance audit resolution

Both uploaded Verified Findings documents contain identical text. Their observations are user-supplied live evidence, not independently repeated live calls from this environment.

## Implemented changes

- CI-AUD-02/05: canonical concept identifiers embedded in a manual problem's evidence now match concept inference. Previously hash-lookup was not recognized as hash lookup. This restores inputs to existing concept connection and transfer matching. Frequency conditions/invariants also map to hash lookup. This is heuristic relevance, not proof that a technique solves the problem.
- CI-AUD-02: explicit help/show/can/could/does requests are extracted in addition to question marks and why/how. Old quote-backed problem-attempt questions can contribute discussion relevance without requiring the new summary prefix. No learner mistake or mastery is invented.
- Context cache version increased to literal-question-v2 so old cached analyses are not reused by the revised extractor. Durable records and question threads are untouched.
- CI-AUD-03: recommendation responses now expose engineRevision audit-relevance-v2. contextRelevance remains a top-level field; its absence on individual recommendation entries is not a defect. This revision marker identifies these capabilities, not a Git commit SHA.
- CI-AUD-01/04: HTTP 401, 403, 429 and other provider errors receive sanitized MEMORY_AUTH_REQUIRED, MEMORY_ACCESS_DENIED, MEMORY_RATE_LIMITED and MEMORY_PROVIDER_UNAVAILABLE codes. Codes propagate through read failures and pending write status. Uncertain writes still require reconciliation; no force resend added.

## Existing behavior retained

Summary and observation receipts are independent. Only confirmed observations enter saved ranking. Per-ID status and bounded retry already exist. A generic queued error alone does not prove the reconciliation implementation is absent. Missing transfer results already carry a grounded-candidate explanation. A summary-only or non-question input need not create an observation. Exact original failed context payloads were not included in the reports, so reproduction of that specific request remains incomplete.

## Still requires live evidence

The four original queue items, authenticated document listing/readback, actual latest-build loading in Go, real new-chat continuation and useful problem-specific follow-ups require the user's running connection. Local fixtures cannot confirm these. Cache TTL boundaries and isolation can be tested locally; real elapsed-time expiry and hosted availability require their respective environments. Deployment stays prohibited. Recall grades and educational improvement require genuine learner attempts, not synthetic production records.

CI-AUD-06 reports a coverage limitation rather than a proven defect. Monitor success is scoped to a task/page. LeetCode's partial recent window remains disclosed. No attempt is made to manufacture complete source history or change monitor/account configuration.

## Recommendation relevance refinement

- The prior context test showed that the broad `hash-lookup` label could add the same temporary relevance points to unrelated hash-map problems. Cross-problem context and history matching now excludes broad hash-map, subarray-family and incremental-counting labels when they appear alone.
- `manual:count-staircase` now has curated read-time concepts for its frequency invariant, endpoint enumeration and incremental updates. Its reviewed transfer to `lc:2444` is explicit and labeled `curated_transfer`; Two Sum and LRU Cache no longer match from `hash-lookup` alone.
- Recommendation responses show each applied context match type, concepts and current-chat evidence pointer. History uses the same relationship policy and discloses derived concepts without rewriting saved events. The score arithmetic is unchanged; score components still sum to totals.
- Engine revision is now `audit-relevance-v4`, recommendation contract is `recommendations-v3`, and the scoring policy remains `learning-v4`. The context-analysis cache key was versioned so old broad-match analysis is not reused.
- The connected Supermemory tool read event `capture:gKe_TGZ-ALsK0RjsQ4nJS2KOxIJ1JXIe4uGEQTapetc` successfully after selecting its `leetcode_problems` space; the document was absent from the default space. This verifies content through this connection but does not resolve `MEMORY_AUTH_REQUIRED` from the separate local/Go MCP OAuth token.
