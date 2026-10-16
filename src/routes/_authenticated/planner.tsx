import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { catalogQuery } from "@/lib/data";
import { buildPlan } from "@/lib/planner";
import { todayISO } from "@/lib/srs";
import { Slider } from "@/components/ui/slider";
import { CatalogBanner } from "@/components/CatalogBanner";

export const Route = createFileRoute("/_authenticated/planner")({
  head: () => ({ meta: [{ title: "Planner — Coding Intuition" }, { name: "description", content: "Plan the next 7-30 days of DSA practice." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: Planner,
});

function Planner() {
  const { data } = useSuspenseQuery(catalogQuery);
  const [days, setDays] = useState(14);
  const [perDay, setPerDay] = useState(2);
  const plan = buildPlan({
    start: todayISO(), days, newPerDay: perDay,
    reviews: data.items.filter((i) => i.progress?.due_date).map((i) => ({ item_id: i.id, title: i.title, due_date: i.progress!.due_date! })),
    unsolved: data.items.filter((i) => !i.progress || i.progress.status === "not_started").map((i) => ({ item_id: i.id, title: i.title, position: i.position })),
  });
  return (
    <div>
      <CatalogBanner imp={data.latestImport} />
      <h1 className="text-3xl font-bold">Planner</h1>
      <div className="mt-6 grid max-w-xl gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm"><span>Days: <b className="font-mono">{days}</b></span>
          <Slider min={7} max={30} step={1} value={[days]} onValueChange={(v) => setDays(v[0])} /></label>
        <label className="space-y-2 text-sm"><span>New problems / day: <b className="font-mono">{perDay}</b></span>
          <Slider min={0} max={6} step={1} value={[perDay]} onValueChange={(v) => setPerDay(v[0])} /></label>
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {plan.map((d) => (
          <div key={d.date} className="rounded-lg border bg-card p-4">
            <div className="font-mono text-xs text-primary">{d.date}</div>
            {d.reviews.length === 0 && d.fresh.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Rest</p>}
            {d.reviews.map((r) => <p key={r.item_id} className="mt-2 text-sm">↻ {r.title}</p>)}
            {d.fresh.map((r) => <p key={r.item_id} className="mt-2 text-sm text-muted-foreground">+ {r.position}. {r.title}</p>)}
          </div>
        ))}
      </div>
    </div>
  );
}
