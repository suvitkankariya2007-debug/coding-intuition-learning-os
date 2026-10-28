# Importing a learner problem catalog

`import_problem_catalog` adds a learner-owned list to the same item, evidence, review, recommendation, and concept-transfer pipeline used by the seeded roadmap. Use it for a personal interview list, a course sheet, or another structured set of DSA practice problems.

The MCP accepts JSON rows through the tool call; it does not currently provide a CSV/file-picker upload. Each call accepts 1–50 rows. Send larger catalogs in batches using the same `catalogId` and stable `externalId` values. The request body limit is 128 KiB, so keep optional descriptions and links reasonably short.

## Import a catalog

Refresh the MCP tool list after deploying this revision, then call `get_learning_catalog` to inspect the current count and existing custom catalog IDs. Call `import_problem_catalog` with a stable ID and structured rows, for example:

```json
{
  "catalogId": "interview-practice",
  "catalogName": "Interview practice list",
  "items": [
    {
      "externalId": "company-001",
      "title": "Minimum capacity to ship packages",
      "topic": "Binary search",
      "conceptKeys": ["binary-search-answer"],
      "idea": "Find the smallest capacity whose feasibility condition is true.",
      "url": "https://example.com/problems/shipping-capacity"
    },
    {
      "externalId": "company-002",
      "title": "Merge overlapping ranges",
      "topic": "Intervals",
      "conceptKeys": ["intervals", "sorting"]
    }
  ]
}
```

`catalogId` must be a lowercase slug 2–28 characters long. An `externalId` is a stable learner-chosen identifier of up to 80 characters. Titles are limited to 200 characters, topics to 80, optional ideas to 500, optional HTTP(S) URLs to 500, and each row may have up to six concept tags. Supported tags are `hash-lookup`, `sorting`, `two-pointers`, `frequency-invariant`, `subarray-enumeration`, `incremental-counting`, `sliding-window`, `prefix-sums`, `binary-search`, `binary-search-answer`, `base-case`, `dfs`, `bfs`, `backtracking`, `dynamic-programming`, `stack-invariant`, `monotonic-stack`, `greedy`, `heap`, `cycle-detection`, `intervals`, `bitmask`, and `bst-ordering`.

The receipt reports how many rows were inserted or updated. Repeating a call with the same catalog and item identifiers updates metadata while preserving item IDs, linked learning history, and reviews. Rows omitted from a later call are kept; an upload does not delete problems. Use consistent `catalogId` and `externalId` spelling in future batches.

## Get recommendations from the uploaded list

By default `get_recommendations` ranks the learner's full tracked problem pool, which includes the 188 seeded items, synchronized platform problems, and custom catalog entries. A new custom list can be small compared with the seed, so pass its `catalogId` when you want recommendations only from that list:

```json
{"catalogId":"interview-practice"}
```

The result includes `catalogScope` and `availableCatalogs`. `get_learning_catalog` returns `catalogs` with each custom catalog's ID, name, and item count. An unknown catalog ID returns an error with the available IDs.

Explicit `conceptKeys` participate in the existing shared-concept, transfer, and evidence-based ranking rules. If tags are omitted, the engine can still infer some concepts from the title and idea, but explicit tags give more reliable matching. When the source item belongs to a custom catalog, concept-connection and transfer suggestions prefer unfamiliar items from that same catalog, then fall back to the wider tracked pool.

Imported metadata is not proof that a problem was attempted, solved, accepted, or mastered. It does not include problem statements or code, and a URL is stored as a reference rather than fetched. Save reasoning observations only when supported by a real learner attempt and approval; record recall reviews only after a real recall attempt and a learner-confirmed grade.

## Storage and privacy

Catalog rows are stored in the private per-learner Durable Object ledger (Cloudflare) or the local SQLite-backed learner store when using the local tunnel. Import is a learning-scoped local durable write and **does not write the catalog to Supermemory**. Approved learning observations, reviews, and other existing memory records continue through their separate Supermemory write and receipt workflow.

The local-tunnel store and a hosted Worker store are separate. Catalog metadata is not automatically copied between them or reconstructed from Supermemory after starting with an empty learner store. Import it into the endpoint where you plan to use it. The response explicitly includes `upstreamMemoryWritePerformed: false` so this boundary is visible.

## Verification

The local suite validates input limits and identifier stability, rejects unsupported tags and unsafe links, verifies catalog-scoped recommendations and custom concept connections, checks history/review retention after upserts and Durable Object restart, confirms that write permission is required, and sends a 50-row request near the allowed metadata limits. `npm run verify:local` runs this with the Worker builds and the rest of the integration suite; it does not deploy or contact a live Supermemory account.
