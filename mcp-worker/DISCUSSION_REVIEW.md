# Discussion to practice and revision

The MCP now has 31 tools. `review_learning_discussion` creates a read-only
coaching plan from one to five short discussion observations supplied by
ChatGPT. It uses curated concept rules and the real synchronized catalog.
It does not run another language model or independently retrieve ChatGPT chats.

## What the plan contains

- The proposed doubt and its short quoted source, kept separate from confirmed
  learning records.
- What to remember, one common pitfall, a fallback approach, why the concept
  deserves review and a recall question for each implicated concept.
- Up to five actual LeetCode/Codeforces catalog problems, with problem references,
  platform links, matched/related concepts, selection reasons, prior status and
  any known next review date. Concept-only curriculum anchors are excluded.
- A review protocol: independent explanation, small counterexample, related
  practice and a confirmed recall grade before scheduling.
- Explicit gaps when the selected platform has no suitable known problem.

Common pitfalls are general teaching examples, not diagnoses that the learner
made every mistake. The returned plan is a proposal and changes no learning
records or ranking. After the learner approves a factual observation, the
existing record_reasoning_event tool can persist it; a genuine recall attempt
and confirmed grade are needed for record_review.

## Source boundaries

For the current chat, ChatGPT supplies a brief observation and exact short quote.
The server labels this client-supplied evidence: it cannot independently verify
the unsaved ChatGPT conversation. Do not claim access to other chats.

For a saved Supermemory discussion, first read the actual document with
read_saved_discussion. Pass documentId, version, Unicode start offset and an
exact excerpt. The server re-reads the span and rejects changed versions or
invented quotations. A verified excerpt from a provider-truncated source is
marked PARTIAL; the unavailable tail is never reconstructed.

LeetCode links search the official catalog by the known LC problem ID because
exact slugs are not stored for all canonical entries. Codeforces problem URLs
are derived from their stored contest/index reference. Link availability and
problem statements are not revalidated live by this tool. Never guess a slug,
difficulty rating or platform problem absent from the catalog.

## Go test prompt

```text
Review the DSA discussion visible in this chat using Coding Intuition.
Identify up to five specific doubts, each supported by a short exact quote.
Use supported concept tags and call review_learning_discussion; do not merely
write your own generic problem list. If the discussion is not available, ask
me for its relevant excerpt or locate a real saved Supermemory document.

For a saved discussion, read it first and use the exact document version,
Unicode offset and source excerpt in the tool call. Report truncation or
missing content honestly. Do not claim access to unsaved older conversations.

Return a compact table:
my observed doubt | concept to remember | common pitfall | fallback if stuck |
practice problem and platform link | why this practice/review matters.
Separate the misconception supported by my quote from general pitfalls.
Explain the constraint or invariant each chosen problem would practise.
Use actual catalog references and disclose when a link is a platform search.
Do not infer unfamiliarity, acceptance, difficulty rating or mastery.

Check my existing history and due reviews before deciding what to practise
first. Give one recall question and wait for my answer. Offer to save one
brief factual observation only after my approval, then read back its receipt
and show how the updated learning records affect recommendations.
Never manufacture a recall grade or write the full chat into memory.
```

For CP-only practice, add: `Use platform codeforces; if no grounded catalog
match exists, report the gap rather than substituting an invented problem.`

## Verification evidence

Automated cases cover current-chat proposals with zero learning writes,
complete concept/pitfall/fallback/review cards, deduplicated actual practice
references, exact saved spans, changed/invented source rejection, provider
truncation, missing CF matches, actual synchronized CF candidates, bounded
inputs, read-only tool annotations and dual JSON/structured output.

These tests establish the software contract. Real Go calls and actual learner
answers still need review. Deployment and merge remain paused.
