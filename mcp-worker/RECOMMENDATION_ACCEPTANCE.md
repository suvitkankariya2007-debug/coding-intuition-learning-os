# Recommendation and continuous learning acceptance

The screenshot baseline was global and retrieved before the new observation was
approved or saved. Its old source-heavy scoring was insufficiently personalized:
GitHub files received an attempted bonus and accumulated failures could dominate.
The suggested tags also did not match the write schema. Refresh discovery after
updating the server; the tool count remains 24.

## Learning-v2 behavior

- Responses include scoringVersion and personalization evidence counts. With no
  saved learner events/reviews, the status is limited_learning_evidence.
- GitHub-only items have unassessed learner status and a small discovery score.
  Their code is still available for retrieval; absence of acceptance is not a
  diagnosed weakness.
- Platform follow-up uses failures after the latest observed acceptance and
  within a 30-day window, with a bounded lower weight. Historical records remain.
  The window/weights are product heuristics, not validated learning probabilities.
- Due reviews and actual approved reasoning observations receive stronger weight.
  A successful review with a future due date temporarily lowers repeat priority;
  a later explicit difficulty or unsuccessful submission can reopen it.
- focusItemId applies temporary current-session relevance. It saves no learner
  event and does not imply the focused problem is a weakness.
- Historical weakConcepts remain auditable. activeWeakConcepts counts unresolved
  observations per problem/concept. A later independently explained observation
  without a reported hint reduces that pressure; another mistake raises it again.
  An assisted answer does not resolve it. A recall grade alone does not establish
  independent understanding. No event declares mastery automatically.
- Schemas advertise supported concept/mistake/hint enums. For the screenshot's
  binary-tree-shape versus BST-ordering confusion, bst-ordering and
  conceptual-understanding are supported. Do not save unsupported invented tags.

## Prompt A: baseline, actual observation, approval and first update

```text
Use actual Coding Intuition tools only. Find the real LC 98 catalog itemId.
Retrieve fresh global recommendations and then recommendations with that
focusItemId. Report scoringVersion, personalization status, saved event/review
counts and scores/reasons. This is a new baseline; do not compare the old
scoring version's numbers with this version. Keep the focus identical for
subsequent before/after comparisons.

Read my relevant preferences and LC 98 history. If my actual diagnostic answer
is present in this chat, assess only that answer. Otherwise ask one short BST
diagnostic question without revealing the deciding property and wait for me.
If a clue was already given, disclose it when describing hint dependence.

Propose one brief factual observation. Use only advertised enum values: for a
confusion between binary-tree shape and BST ordering, bst-ordering and
conceptual-understanding may fit; do not invent extra tags. Explain any chosen
tags and ask my approval. Wait before writing.

After approval, save once with record_reasoning_event and retain clientEventId
and the receipt. Read get_problem_history, get_learning_signals,
diagnose_weaknesses and get_recommendations using the original focusItemId.
Show what actual evidence changed. Unchanged top-five ordering can be valid;
explain score/reason changes without claiming learning improvement yet.
Never call a source-only follow-up a confirmed learner weakness.
```

Pass: focus is explicitly temporary, the event exists only after approval,
accepted enum values are used, history/signals agree, and scores are compared
under the same focus/version. No approval or write means PENDING, not PASS.

## Prompt B: recall, improving pattern and idempotent review

```text
Continue with the same real itemId and recommendation focus. Save a fresh
baseline. Ask a different small BST example that tests the same ordering idea.
Do not give its answer or a deciding clue before I respond. Wait for my answer.

Evaluate my explanation and actual hints used. If it supports a new reasoning
insight or recall_check, propose that observation using the same supported
concept tag. Ask approval before saving it. Mark independentlyExplained only
when supported by my answer and actual hint use.

Explain the recall scale: 0 no recall, 1 wrong with recognition, 2 major help,
3 correct with difficulty, 4 correct with slight hesitation, 5 easy correct.
Ask me to confirm a grade, then record_review with a fresh stable clientEventId.
Retry only that identical review once with the same ID and arguments.

Read back the learning event and review. Report IDs, grade, nextDue and review
count. Show historical weakConcepts versus activeWeakConcepts and compare the
same-focus recommendations. An assisted explanation must not resolve the
active difficulty; a genuinely independent approved observation can reduce it.
Keep other problems' unresolved difficulties and original history intact.
No second review should be created by the retry. Report partial/fail honestly.
```

Pass: a real attempt and confirmed grade precede the review; independent and
assisted performance are distinguished; due date/receipts survive readback;
historical observations remain, active pressure adjusts, and duplicate count
does not increase. Identical ranking alone is not proof of a failed update.

## Prompt C: fresh-chat continuity and a new pattern

Restart the local server without clearing its ledger. In a fresh Go chat,
select the refreshed plugin and include the actual returned receipt report:

```text
Use Coding Intuition to verify these actual receipts:
[PASTE itemId, event clientEventIds, review clientEventId and receipts]

Retrieve the original history, grade, current due date and learning signals.
Do not recreate missing records or treat this pasted report as database proof.
Read fresh recommendations using the same focusItemId and scoringVersion.
Distinguish persisted evidence from current source changes and temporary focus.

Now ask one short diagnostic for a different concept/problem selected from
actual recommendations. Wait for my answer. Propose a factual new observation,
ask approval, and save only after approval using supported tags and a new ID.
Read it back and show whether the new pattern affects relevant recommendations
while preserving the older BST history and review schedule.

If I later make an actual mistake again on the original concept, propose a
separate approved observation; do not delete the earlier improvement. Show
whether active difficulty rises again. Do not invent a relapse to pass a test.
Return requirement, actual tool evidence, PASS/PARTIAL/FAIL and next action.
```

Pass: stored records survive, new patterns influence relevant scores, and
independent improvement/relapse remain chronological observations. Unexpected
missing history is a failure; unavailable Go tooling is blocked.

## Fresh-source monitoring evidence

Capture get_monitor_status before a genuine new push/submission, leave the
local runtime alive for at least 35 minutes, then compare task success times and
retrieve that exact new item. Do not manually sync and call it background proof.
An explicit on-demand sync is a different valid test and must be labeled as such.
The LeetCode latest-20 window and unsaved-chat limitations still apply.

Software tests use isolated fixtures. They establish these transitions and
restart behavior, not educational effectiveness or a real learner's consent.
Deployment and merge remain paused.
