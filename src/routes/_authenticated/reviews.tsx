import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { catalogQuery, type CatalogRow } from "@/lib/data";
import { review, todayISO } from "@/lib/srs";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({ meta: [{ title: "Reviews — Coding Intuition" }, { name: "description", content: "Spaced-repetition reviews due today." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: Reviews,
});

const GRADES = [
  { g: 1, label: "Forgot" }, { g: 3, label: "Hard" }, { g: 4, label: "Good" }, { g: 5, label: "Easy" },
];

function Reviews() {
  const { data } = useSuspenseQuery(catalogQuery);
  const today = todayISO();
  const due = data.items.filter((i) => i.progress?.due_date && i.progress.due_date <= today);
  const unscheduled = data.items.filter((i) => i.progress && !i.progress.due_date && i.progress.status !== "not_started");
  return (
    <div>
      <h1 className="text-3xl font-bold">Reviews <span className="font-mono text-base text-muted-foreground">{due.length} due</span></h1>
      <p className="mt-2 text-sm text-muted-foreground">Grade how well you could re-derive the solution without looking.</p>
      <div className="mt-6 space-y-3">
        {due.map((i) => <ReviewCard key={i.id} row={i} />)}
        {due.length === 0 && <p className="text-muted-foreground">Nothing due today.</p>}
      </div>
      {unscheduled.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-bold">Not yet scheduled</h2>
          <p className="text-sm text-muted-foreground">Items you've attempted or solved. Grade once to start their schedule.</p>
          <div className="mt-4 space-y-3">{unscheduled.map((i) => <ReviewCard key={i.id} row={i} />)}</div>
        </>
      )}
    </div>
  );
}

function ReviewCard({ row }: { row: CatalogRow }) {
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const m = useMutation({
    mutationFn: async (grade: number) => {
      const p = row.progress;
      const today = todayISO();
      const next = review({ ease: Number(p?.ease ?? 2.5), interval_days: p?.interval_days ?? 0, repetitions: p?.repetitions ?? 0 }, grade, today);
      const { error } = await supabase.from("item_progress").upsert(
        { user_id: user.id, item_id: row.id, ...next, last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          status: p?.status && p.status !== "not_started" ? p.status : "attempted" },
        { onConflict: "user_id,item_id" },
      );
      if (error) throw error;
      const log = await supabase.from("review_log").insert({ user_id: user.id, item_id: row.id, grade, next_due: next.due_date });
      if (log.error) throw log.error;
      return next.due_date;
    },
    onSuccess: (d) => { toast.success(`Next review ${d}`); qc.invalidateQueries({ queryKey: ["catalog"] }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div>
        <div className="font-medium">{row.position}. {row.title}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.topic ?? "—"} · due {row.progress?.due_date ?? "unscheduled"}</div>
      </div>
      <div className="flex gap-2">
        {GRADES.map((g) => (
          <Button key={g.g} size="sm" variant={g.g >= 4 ? "default" : "outline"} disabled={m.isPending} onClick={() => m.mutate(g.g)}>{g.label}</Button>
        ))}
      </div>
    </div>
  );
}
