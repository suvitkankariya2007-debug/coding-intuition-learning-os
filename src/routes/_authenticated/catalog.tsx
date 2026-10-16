import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { catalogQuery, STATUSES, type CatalogRow, type Status } from "@/lib/data";
import { CatalogBanner } from "@/components/CatalogBanner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({ meta: [{ title: "Catalog — Coding Intuition" }, { name: "description", content: "Your imported DSA curriculum." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: Catalog,
});

function Catalog() {
  const { data } = useSuspenseQuery(catalogQuery);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<CatalogRow | null>(null);
  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return data.items.filter((i) => !s || i.title.toLowerCase().includes(s) || (i.topic ?? "").toLowerCase().includes(s));
  }, [data.items, q]);

  return (
    <div>
      <CatalogBanner imp={data.latestImport} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Catalog <span className="font-mono text-base text-muted-foreground">{data.items.length}</span></h1>
        <Input placeholder="Search title or topic" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {data.items.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No entries. Import your roadmap document to populate the catalog.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted font-mono text-xs uppercase text-muted-foreground">
              <tr><th className="p-3 text-left">#</th><th className="p-3 text-left">Title</th><th className="p-3 text-left">Topic</th><th className="p-3 text-left">Difficulty</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Due</th></tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="cursor-pointer border-t hover:bg-secondary/50" onClick={() => setOpen(i)}>
                  <td className="p-3 font-mono text-muted-foreground">{i.position}</td>
                  <td className="p-3 font-medium">{i.title}</td>
                  <td className="p-3 text-muted-foreground">{i.topic ?? "—"}</td>
                  <td className="p-3">{i.difficulty ?? "—"}</td>
                  <td className="p-3"><StatusBadge s={i.progress?.status ?? "not_started"} /></td>
                  <td className="p-3 font-mono text-xs">{i.progress?.due_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <Editor row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const v = s === "mastered" || s === "solved" ? "default" : s === "attempted" ? "secondary" : "outline";
  return <Badge variant={v}>{s.replace("_", " ")}</Badge>;
}

function Editor({ row, onClose }: { row: CatalogRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const [status, setStatus] = useState<Status>((row.progress?.status as Status) ?? "not_started");
  const [notes, setNotes] = useState(row.progress?.notes ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("item_progress").upsert(
        { user_id: user.id, item_id: row.id, status, notes, updated_at: new Date().toISOString() },
        { onConflict: "user_id,item_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog"] }); toast.success("Saved"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("item_progress").delete().eq("item_id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog"] }); toast.success("Progress cleared"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row.position}. {row.title}</DialogTitle></DialogHeader>
        {row.url && <a href={row.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Open problem</a>}
        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea rows={6} placeholder="Private notes — only you can read these" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => remove.mutate()} disabled={!row.progress}>Clear progress</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
