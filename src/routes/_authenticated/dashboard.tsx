import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { catalogQuery, STATUSES } from "@/lib/data";
import { todayISO } from "@/lib/srs";
import { recommendDSA, type LearningItem, type Evidence } from "@/lib/evidence-intelligence";
import { syncPublicPlatforms } from "@/lib/platform-sync";
import { CatalogBanner } from "@/components/CatalogBanner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Coding Intuition" }, { name: "description", content: "Your DSA study overview." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(catalogQuery);
  const qc = useQueryClient();
  const [leetcode, setLeetcode] = useState("suvitk");
  const [codeforces, setCodeforces] = useState("suvitkankariya2007");
  const sync = useMutation({
    mutationFn: () => syncPublicPlatforms({data:{leetcode,codeforces}}),
    onSuccess: result => {
      void qc.invalidateQueries({queryKey:["catalog"]});
      if (result.errors.length) toast.warning(`Matched ${result.matched} submission(s). ${result.errors.join("; ")}`);
      else toast.success(`Matched ${result.matched} submission(s) to your roadmap`);
    },
    onError: err => toast.error(err.message),
  });
  const today = todayISO();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const i of data.items) { const k = i.progress?.status ?? "not_started"; counts[k] = (counts[k] ?? 0) + 1; }
  const due = data.items.filter((i) => i.progress?.due_date && i.progress.due_date <= today).length;
  // Use only the current authenticated catalog's progress. External account evidence
  // remains empty until verified ingestion is implemented; never fabricate submissions.
  const learningItems: LearningItem[] = data.items.map(i => ({
    id: i.id, title: i.title, topic: i.topic ?? "Uncategorized", position: i.position,
    dueDate: i.progress?.due_date ?? null,
    recallGrade: (() => { const g = data.latestReviewByItem.get(i.id)?.grade; return g == null ? null : (g <= 1 ? 0 : g === 2 ? 1 : g === 3 ? 2 : 3) as 0 | 1 | 2 | 3; })(),
    lastReviewedAt: data.latestReviewByItem.get(i.id)?.reviewed_at ?? null,
    status: (i.progress?.status ?? "not_started") as LearningItem["status"],
    attemptCount: i.progress?.status === "attempted" ? 1 : 0,
  }));
  const evidence: Evidence[] = data.evidence.filter(e => e.item_id && (
    e.source === "leetcode" || e.source === "codeforces" || e.source === "github"
  )).map(e => ({
    itemId: e.item_id!, source: e.source as Evidence["source"],
    observedAt: e.observed_at, provenanceId: e.provenance_id,
    verdict: e.verdict, accepted: e.accepted,
  }));
  const recommendations = recommendDSA(learningItems, evidence, { now: new Date().toISOString(), limit: 5 });
  return (
    <div>
      <CatalogBanner imp={data.latestImport} />
      <h1 className="text-3xl font-bold">Today</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <Stat label="Reviews due" value={due} accent />
        {STATUSES.map((s) => <Stat key={s} label={s.replace("_", " ")} value={counts[s] ?? 0} />)}
      </div>
      <div className="mt-8 flex gap-3">
        <Button asChild><Link to="/reviews">Start reviews</Link></Button>
        <Button asChild variant="outline"><Link to="/planner">Open planner</Link></Button>
      </div>
      <section className="mt-10" aria-label="Recommended practice">
        <h2 className="text-xl font-bold">Recommended next problems</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ranked using saved review grades and matched public platform submissions. Unmatched submissions are never counted.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <label className="text-xs text-muted-foreground">LeetCode public handle
            <input aria-label="LeetCode username" className="mt-1 block rounded-md border bg-background px-2 py-2 text-sm text-foreground" value={leetcode} onChange={e=>setLeetcode(e.target.value)} maxLength={40}/>
          </label>
          <label className="text-xs text-muted-foreground">Codeforces public handle
            <input aria-label="Codeforces handle" className="mt-1 block rounded-md border bg-background px-2 py-2 text-sm text-foreground" value={codeforces} onChange={e=>setCodeforces(e.target.value)} maxLength={40}/>
          </label>
          <Button disabled={sync.isPending} onClick={()=>sync.mutate()}>{sync.isPending ? "Syncing..." : "Sync public submissions"}</Button>
          <span className="text-xs text-muted-foreground">LeetCode recent public accepted only; Codeforces recent 100. Read-only, no platform passwords.</span>
        </div>
        <ol className="mt-4 space-y-3">
          {recommendations.map(r => (
            <li key={r.itemId} className="rounded-lg border bg-card p-4">
              <div className="font-medium">{r.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{r.reason.join(" · ") || "Curriculum order"}</div>
            </li>
          ))}
        </ol>
        {recommendations.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Import a curriculum to start receiving recommendations.</p>}
      </section>
      <p className="mt-10 text-sm text-muted-foreground">
        Counts reflect only what you record here — nothing is pre-filled or inferred.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="font-mono text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display text-3xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
