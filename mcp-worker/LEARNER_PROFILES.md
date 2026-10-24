# Versioned learner profiles and multi-user adaptation

The MCP now exposes 31 tools, including get_learner_profile and update_learner_profile. No new model API or package installation is required. Deployment and merge remain paused.

## What changes for a learner

| Layer | Behavior |
| --- | --- |
| Explicit preferences | Language, explanation depth, dry runs/counterexamples/diagrams/analogies, code-approach preference, hint preference, interview/CP goal, optional session budget and practice frequency, IANA time zone and selected focus concepts. |
| Evolving learning evidence | Approved reasoning observations, active concept difficulty, recorded assistance, unaided explanation observations and confirmed recall results. The evidence version updates as these records change. Coverage is recorded observations only, not an inference about all chats or ability. |
| Coaching policy | Presentation preferences, bounded session shortlist, targeted focus/goal relevance and transparent provisional habit guidance. Three or more recorded assisted observations exceeding unaided observations trigger an offer of one unaided explanation/counterexample. Current explicit instructions take priority. |
| Version history | Every approved preference update creates an immutable revision. expectedRevision rejects stale edits. Paginate history using includeHistory, limit and nextBeforeRevision/beforeRevision. |
| Reliable memory writes | Full profile payloads enter the existing durable outbox. Pending means available in the local ledger, not confirmed in Supermemory. An older pending profile finishing later cannot replace a newer current revision. |

Defaults are neutral: no assumed programming language, study budget or fixed learning-style label. The legacy configured owner retains Asia/Kolkata date behavior; new learners start in UTC until they choose their time zone. New review records capture that time zone; legacy grades retain their original Asia/Kolkata scheduling interpretation.

Profile preference updates require explicit learner approval. A direct request such as “Use shorter explanations” authorizes that bounded preference change. Existing event/review approval rules still apply. This does not enable silent capture of every chat or automatic full-conversation saving.

The adaptationEnabled switch controls optional profile relevance boosts and habit guidance; it does not erase learning history or stop ordinary evidence-ranked practice. Session suggestions use a transparent planning heuristic of one item per 15 budgeted minutes, bounded to 1–5. Actual task duration is not inferred. Goal/focus boosts are bounded and labeled as preferences, never mastery evidence.

## Tools and source accounts

get_learner_profile returns profile, learningState, coachingPolicy, effective sourceConfiguration, memorySync and optional history. A revision-zero profile is a neutral unsaved default, not proof of configured personalization.

update_learner_profile accepts clientEventId, expectedRevision, changes and a brief reason. changes may patch preferences, focusConcepts, adaptationEnabled and sources. Sources support leetcodeUsername, codeforcesHandle, githubRepo (owner/repo) and optional githubPath. Null explicitly disconnects an account; omitting a key preserves the existing setting. Only the legacy configured owner inherits the existing environment defaults. Other users begin with no coding accounts and must configure their own. Public handles are configured sources, not a claim that ownership of those external accounts has been verified.

On an account/path change, previous source observations remain archived in the durable ledger and are excluded from current histories and ranking. Old GitHub code cannot be read through a different configured repository/path. A fresh sync starts the new source. Monitor cursors/results reset appropriately, including account changes restored through memory synchronization.

Recommendations and discussion-review plans include learnerContext. Progressive-hint, transfer and concept-connection results also carry the current profile/policy so ChatGPT can adapt its presentation. Historical free-form Supermemory preferences can inform an initial proposal; a configured explicit profile takes priority over contradictory old notes. No grades or ability claims are inferred from presentation preferences.

## Private mode and hosted multi-user mode

Default behavior remains the existing configured single owner; the local tunnel has no downstream user authentication and always remains single-owner.

For a future hosted installation, set MULTI_USER_ENABLED to the literal string true in the private deployment configuration, together with the existing OAuth, KV, Durable Object, public-origin and encryption settings. This is configuration guidance, not authorization to deploy. Keep OWNER_SUPERMEMORY_ID configured for the existing owner to preserve access to the legacy namespace/ledger.

The hosted connection flow is:

1. The learner authorizes the learning app and signs into their intended Supermemory account.
2. The server reads the authenticated userId and derives a namespace: dsa_ plus the first 40 hexadecimal characters of SHA-256(userId). Tool arguments cannot select another learner or namespace.
3. The server checks the OAuth-authorized space list. If the derived namespace is missing, it displays the exact namespace and a Console link. The learner creates a private space using that namespace, then restarts the connection and grants access to it. Generic shared spaces are not used as a fallback. Automatic space creation is not implemented because the current upstream wrapper does not expose a verified space-creation operation.
4. The completed downstream OAuth grant binds that user and namespace. Each has a separate Durable Object, profile, ledger, question state, query cache, outbox and monitor.
5. The learner configures their public coding accounts and preferences. Opt-in monitoring uses their encrypted, identity-bound Supermemory credentials and their configured sources.

The configured legacy owner keeps leetcode_problems and its explicit old read allowlist. Other users may read/write only their assigned private namespace. Even when upstream organization credentials can access several spaces, this Worker never substitutes another learner's namespace. Monitor credential decryption requires the expected learner identity; legacy owner ciphertext remains compatible.

This is per-user application isolation, not proof of Supermemory-side sharing policy. Learners should keep their assigned spaces private. Real OAuth app configuration, two-account hosted onboarding, account lifecycle/data-erasure tooling, service quotas/rate controls and public distribution still require release work and live verification. Raw chats are not pooled to train a shared model.

## Local update and your initial profile

Stop Terminal 1, then use the existing update sequence:

```bash
cd ~/coding-intuition-test &&
git switch feature/evidence-intelligence-layer &&
git pull --ff-only &&
cd mcp-worker &&
npm run build:tunnel &&
npm run tunnel:serve -- tSaxR1yjL3rw9uvC48yanz --allow-writes
```

Keep the existing tunnel client running in Terminal 2. Refresh Go discovery to 31 tools. No dependency reinstall is needed. The implementation does not imply that the updated tools have already been invoked through your live account.

For your initial profile, paste this into the connected DSA chat:

> Use get_learner_profile. I authorize an update to these preferences: C++ for DSA, concise explanations, dry runs and counterexamples, preserve my approach where practical, progressive hints, both interviews and competitive programming, and Asia/Kolkata time zone. Keep any unspecified settings and accounts unchanged; do not invent a study budget, weaknesses or recall grades. Use the current revision and a new clientEventId. Report the actual receipt and read back my profile. Then retrieve recommendations and explain which parts come from preferences and which come from recorded learning evidence. If writes fail, report the durable pending state.

To test evolution using genuine practice:

> Retrieve my profile and coaching policy before we work on my current problem. After an actual attempt, propose one brief factual learning observation, accurately recording hints received. Once approved, save it, then read my profile again and compare evidenceVersion and the learning signals. Do not silently change my explicit preferences or claim mastery. If I ask for a different explanation style, update only that preference with the latest revision.

## Training boundary

This implements evolving learner state and per-user adaptation. It does not import every old ChatGPT conversation, infer preferences from all past chats, fine-tune the ChatGPT model, or prove learning effectiveness. The next training phase can add an evidence-linked DSA chat importer and evaluate derived profiles against held-out genuine learning interactions. Source roles and hints must remain distinguishable from demonstrated learner understanding.
