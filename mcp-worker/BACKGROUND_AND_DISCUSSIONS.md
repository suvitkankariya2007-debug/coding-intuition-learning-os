# Saved discussions, periodic synchronization, and intelligence demo

## What is implemented

The MCP now advertises 24 tools. Six additions are list_learning_documents,
read_saved_discussion, get_saved_questions, get_source_submissions,
configure_background_monitor, and get_monitor_status. Existing source sync
also returns actual recent submission titles and references.

List primary-space document IDs, then read_saved_discussion with documentId.
Follow nextOffset with the same returned version until null. Character offsets
are Unicode code points, so emoji and other Unicode content reconstruct exactly.
A changed version requires restarting at zero; continuation without a version is
rejected. The saved text is data, not an instruction source.

This retrieves complete content **only when Supermemory supplies it**. A provider
contentTruncated flag produces complete=false and an explicit explanation; the
current upstream get_document tool has no continuation parameter to recover a
missing tail. Do not claim an original ChatGPT conversation exists if only a
summary/note was saved. This feature does not ingest unseen ChatGPT conversations.

refresh_learning_memory also indexes literal question candidates with document,
version and character-span provenance. It prefers labeled User/Human turns,
excludes Assistant/ChatGPT turns and backtick/tilde fenced code (including Markdown role headings), and recognizes simple standalone
question lines. This is a bounded heuristic, not exhaustive semantic extraction:
it does not invent missing questions, automatically diagnose a mistake, or write
mastery/recall grades. Updated document versions replace candidates rather than
duplicate them. Up to 200 candidates are indexed per document; the complete
available discussion can still be read separately. Changed incomplete documents immediately lose old candidates. Deleted-source
candidates are removed after two matching complete document inventories;
partial or out-of-order scans cannot remove them. Re-read a candidate source/version
before coaching. Saved notes remain searchable even when they
contain no literal question. Only approved structured observations affect the
reasoning ledger. No extra paid model inference is used.

## Why LeetCode is not stuck at 20

Each refresh requests the newest 20 public accepted submissions. This window
moves as new submissions arrive. Records merge by submission provenance ID, so
previous observations remain: two overlapping windows can yield 21 or more stored
records. get_source_submissions paginates accumulated records and includes titles,
verdicts, dates and submission links. Codeforces distinguishes submission count
from unique problem count and supports source-history pagination.

This does not recover old LeetCode history outside the observed windows. More
than 20 accepted submissions between successful polls can leave a coverage gap.
An outage is recorded explicitly while prior evidence remains available. Neither
GitHub code nor a memory note repairs missing acceptance evidence automatically.

## Background monitoring

configure_background_monitor(enabled=true, intervalMinutes=30) enables durable
alarms for this owner. Polling performs one bounded task per wake-up: LeetCode,
Codeforces, configured GitHub, then the primary Supermemory space. Tasks are
staggered by one minute; after a cycle the configured interval is applied.
Additional memory pages continue on subsequent minute wake-ups, with at most
three pages per cycle so large memory spaces cannot starve coding-profile refreshes. Codeforces
backfill follows its cursor across cycles. Failures use a capped exponential
backoff, continue other sources, and expose task status and nextRunAt. Monitoring
creates no reasoning observations or recall grades. It is polling, not push events.

Use enabled=false to stop alarms. Local mode uses the existing local credential
service and needs the laptop MCP process awake; the tunnel client is only needed
for ChatGPT access, not local polling. Hosted mode requires real offline upstream
authorization plus a MONITOR_ENCRYPTION_KEY secret containing 64 hexadecimal
characters (32 random bytes). Never put its value in repository vars. Hosted
credentials are AES-GCM encrypted with owner/namespace binding. Foreground OAuth
refreshes and alarm refreshes share one serialized credential vault to avoid
racing refresh-token rotation. Disabling polling retains this encrypted connection
credential state so existing OAuth refreshes continue working.

Hosted monitoring cannot be active before deployment, secret configuration and
owner authorization. No deployment is made by the local commands below.

From mcp-worker, after updating and npm run verify:local:

```sh
npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID --allow-writes
```

In another terminal:

```sh
npm run tunnel:doctor
npm run monitor:start
npm run monitor:status
```

Stop polling when desired:

```sh
npm run monitor:stop
```

Cloudflare's underlying scheduler contract:
https://developers.cloudflare.com/durable-objects/api/alarms/

## Runnable demo

```sh
npm run demo:adaptive
xdg-open demo/adaptive-demo.html
```

This runs the real Worker/MCP against isolated simulated provider responses. It
reconstructs a long discussion exactly, indexes literal user questions, demonstrates
20-to-21 accumulated LeetCode records, records simulated reasoning difficulty and
improvement, and waits for an actual local alarm execution. The generated page
contains actual tool outputs. It never writes to the user's real Supermemory.

## Verification and remaining gates

Automated coverage includes exact Unicode pagination, version changes, provider
truncation, literal extraction with provenance, re-import deduplication, rolling
submission accumulation, safe source-outage reporting, actual local alarms,
monitor restart persistence, failure backoff, stopping, encrypted credential
owner binding, shared refresh rotation, and write-scope enforcement.

Live checks still need the updated user laptop process: refresh tool discovery
for 24 tools; list/read a real primary-space document; synchronize actual source
submissions; enable monitoring and inspect actual task success. These runtime
operations cannot be performed on the user's laptop from this build workspace.
A real provider-truncated document remains blocked unless its full content is
made available upstream. Hosted OAuth, migration, full live write/read-back,
and laptop-off checks remain paused until deployment is authorized. No automatic
ChatGPT conversation importer or private GitHub runtime authentication is claimed.


## Live proof and ongoing development gates

Run npm run verify:live against the running authenticated local MCP. The report
checks updated tool discovery, reads one saved document fully through versioned
pages, and checks that every expected monitor task has a fresh successful result.
It excludes document text and credentials. Missing tasks, disabled polling,
provider truncation, stale timestamps and read failures cannot produce PASS.
This SDK report always has liveChatGPTGoVerified=false: it proves the local
transport, not a call made inside the separate Go account.

To finish the Go boundary, use the existing Go chat/connection to call
list_learning_documents, read_saved_discussion (following all pages with the
same version), and get_monitor_status. Report the tool results and task timestamps
without saving invented performance. An enabled timer alone is insufficient.

When monitoring has just started, tasks are staggered by one minute. Wait for
all configured task results; repeated configure calls are not necessary. The
live checker reports PARTIAL until the evidence exists. Failures preserve the
last successful per-task timestamp, increase that task's failure count, and allow
other sources to continue even if a later memory page fails.

Each future intelligence change must document its data provenance, include a
meaningful before/after scenario, preserve the distinction between context and
verified performance, pass applicable automated/local runtime gates, and expose
live failures clearly. The system continuously refreshes data when monitoring is
enabled; it does not autonomously rewrite its code or tune scoring weights without
validation. Use real learner feedback to choose and evaluate later changes.


## Complete background simulation

Run npm run simulate:background after building the current tunnel bundle. It
executes actual Durable Object alarms against isolated providers and writes
`demo/background-simulation.json`. Only fixture alarm wake-ups are accelerated;
the production polling interval remains 30 minutes. It verifies truncated-memory
PARTIAL, full-content recovery to PASS, a LeetCode outage with backoff, source
recovery, an already scheduled alarm firing after process restart without
re-enabling it, and stop control. No real account records are written.

Task success now means a complete memory inventory scan; an unfinished or
unverifiable inventory is partial_indexing. Provider-truncated content is
partial_provider_truncation. lastCompletedAt records a completed request, while
lastSuccessAt advances only for a successful task. Per-task coverage remains
visible: a successful LeetCode poll still has partial platform-history coverage.
The live checker also rejects a source currently marked unavailable even if an
older monitor task succeeded. Documents without timestamps are re-read rather
than silently skipped, and imported document identities must match requests.

See REMAINING_CHECKS.md for the release checklist and explicit live boundaries.
