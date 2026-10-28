# An expanding DSA learning system

The canonical 188 problems are a seed, not the recommendation boundary.
`get_roadmap` retains that stable curriculum view. `get_learning_catalog` returns
the seed plus newer problems discovered from configured coding profiles, GitHub
solution files, and approved reasoning observations about new questions.
`get_progress_report` distinguishes canonicalCount (as curriculumCount) from the
expanded trackedProblemCount; recommendations rank the expanded pool.

## Learning loop in ChatGPT web

1. At the start of practice, inspect `get_source_status`. Synchronize stale or
   missing GitHub, LeetCode and Codeforces observations with
   `sync_learning_source`. Use `force: true` after a known new push or submission
   instead of waiting for the ten-minute cache. Follow Codeforces nextCursor.
2. Search `get_memory_patterns` for the actual question, doubts and preferences.
   Use `refresh: true` after fresh memory has been added externally. That clears
   search caches before retrieval, so later recommendations can obtain new
   context too. Reads remain bounded to six excerpts; use read_saved_discussion for complete available document pages.
3. Use `get_learning_catalog` for new problems and their stable itemIds. Use
   `get_problem_code` for one synchronized GitHub file when discussing the
   learner's implementation. Code is retrieved at its pinned commit, not
   executed, and is marked untrusted data. Return at most 12,000 characters from
   files no larger than 64 KiB. GitHub exporter numbers are never treated as
   LeetCode IDs. Ambiguous identity is not guessed across sources.
4. Discuss observations, invariants, alternatives, mistakes, complexity and edge
   cases in ChatGPT. Save a short approved `record_reasoning_event` linked to its
   catalog itemId or a valid `problemRef`. New questions can use `lc:NUMBER`,
   `cf:CONTESTINDEX`, or `manual:short-descriptive-slug`. There is no requirement
   to squeeze them into a canonical roadmap ID. Explicit concept keys connect
   their reasoning difficulties to practice across the pool.
5. New problem references in saved events become tracked learning items. A later
   real insight is a new event. Independently explained progress after a mistake
   reduces that problem's practice priority, but does not prove acceptance or
   mastery. Learner-confirmed recall grades schedule reviews for external items
   as well as canonical ones. Problem history returns the reasoning observations.
6. Request recommendations, related concepts, transfer exercises, and due
   reviews. Ranking uses structured observations, recall and platform evidence;
   free-form memory is coaching context, not an automatically inferred grade.

The server's tutor instructions describe this loop. ChatGPT still decides tool
selection; the MCP does not read unshared chats, watch the screen, or retrain a model. Refreshes can
run on demand or through explicitly enabled periodic monitoring. See BACKGROUND_AND_DISCUSSIONS.md.
The deployed service can support those calls with the laptop off after hosted
OAuth, migration and live calls have been validated. No deployment is authorized
by these changes.

## Sources and coverage

- LeetCode retains public aggregate totals and the latest 20 accepted
  submissions. Verified frontend IDs outside the seed become separate items.
  This is not a full accepted-history export.
- Codeforces imports accepted and non-accepted submissions into the learning
  evidence pool, keeping CF identities separate from LC. One page is at most
  1,000 submissions; follow nextCursor for more history.
- The configured public GitHub solutions repository is scanned for up to 2,000
  code files per sync. New titles are included even if absent from the seed.
  Truncated trees and scan limits are reported. Repeated scans update the same
  file reference instead of duplicating it. A file proves code availability,
  not an accepted verdict or understanding. Private repositories require a
  separately designed runtime authorization; no GitHub write connector token is
  silently reused.
- The ledger stores compact metadata and learning events, not the source code
  corpus. Raw code is fetched on request. A code question can be recorded as an
  observation, not as an automatic diagnosis inferred merely from code existence.

## New Supermemory spaces

New notes in the configured spaces are searchable after cache expiry or explicit
refresh. A new namespace is not automatically trusted just because it exists.
Defaults are `leetcode_problems` (primary write space) and `leetcode` (read only).
Explicitly list additional DSA spaces, not unrelated TIFA or cybersecurity spaces.

Locally, set `CODING_INTUITION_MEMORY_READ_NAMESPACES` before starting the server;
for the later hosted configuration use `MEMORY_READ_NAMESPACES`. Both are a
comma-separated list of namespace names. These are configuration values, not
secrets or tool-supplied namespace overrides. Writes still go only to the primary
space and require the intended Supermemory owner.

## Local verification and hosted migration

Run `npm run verify:local` for simulated-provider unit/runtime tests, then run the
server and `npm run tunnel:doctor` for real local reads. The discovery contract is
now 38 tools (including get_learning_catalog and get_problem_code); ChatGPT must
refresh cached tool definitions. This does not create another tunnel.

External observations retain stable problem references. Approved events and
external review metadata can be reconstructed from Supermemory with
`refresh_learning_memory` into a fresh ledger. Source catalogs/code references
must also be re-synchronized from the configured profiles and repository. Compare
counts and receipts before switching to a later hosted store; laptop files are
not automatically transferred. Both entrypoints share the handler and catalog.

No simulated test is proof of a real Go call, private-repository authorization,
fresh-chat automatic tool selection, hosted OAuth, or operation with the laptop
off. Those remain live validation gates.
