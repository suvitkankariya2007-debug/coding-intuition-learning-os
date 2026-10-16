import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQuery, STATUSES } from "@/lib/data";
import { todayISO } from "@/lib/srs";
import { CatalogBanner } from "@/components/CatalogBanner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Coding Intuition" }, { name: "description", content: "Your DSA study overview." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(catalogQuery);
  const today = todayISO();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const i of data.items) counts[i.progress?.status ?? "not_started"]++;
  const due = data.items.filter((i) => i.progress?.due_date && i.progress.due_date <= today).length;
  return (
    <div>
      <CatalogBanner imp={data.latestImport} />
      <h1 className="text-3xl font-bold">Today</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <Stat label="Reviews due" value={due} accent />
        {STATUSES.map((s) => <Stat key={s} label={s.replace("_", " ")} value={counts[s]} />)}
      </div>
      <div className="mt-8 flex gap-3">
        <Button asChild><Link to="/reviews">Start reviews</Link></Button>
        <Button asChild variant="outline"><Link to="/planner">Open planner</Link></Button>
      </div>
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
