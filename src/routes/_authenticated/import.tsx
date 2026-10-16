import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { catalogQuery } from "@/lib/data";
import { parseCsv, parseDocx, rowsToEntries, type ParsedEntry } from "@/lib/parse-roadmap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const EXPECTED = 188;

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import roadmap — Coding Intuition" }, { name: "description", content: "Import your DSA roadmap document." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: ImportPage,
});

function ImportPage() {
  const { data } = useSuspenseQuery(catalogQuery);
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [entries, setEntries] = useState<ParsedEntry[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const imp = data.latestImport;

  async function onFile(f: File) {
    setFileName(f.name);
    try {
      const rows = f.name.toLowerCase().endsWith(".docx") ? await parseDocx(f) : parseCsv(await f.text());
      const parsed = rowsToEntries(rows);
      setEntries(parsed);
      if (!parsed.length) toast.error("No table rows found in that file.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
    }
  }

  async function commit() {
    if (!entries?.length) return;
    if (data.items.some((i) => i.progress) && !confirm("Replacing the catalog deletes your existing progress and notes. Continue?")) return;
    setBusy(true);
    try {
      const del = await supabase.from("curriculum_items").delete().eq("user_id", user.id);
      if (del.error) throw del.error;
      const ins = await supabase.from("catalog_imports")
        .insert({ user_id: user.id, source_name: fileName, expected_count: EXPECTED, imported_count: entries.length })
        .select().single();
      if (ins.error) throw ins.error;
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100).map((e) => ({ ...e, user_id: user.id, import_id: ins.data.id }));
        const r = await supabase.from("curriculum_items").insert(chunk);
        if (r.error) throw r.error;
      }
      toast.success(`Imported ${entries.length} entries`);
      setEntries(null);
      qc.invalidateQueries({ queryKey: ["catalog"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function setVerified(v: boolean) {
    if (!imp) return;
    const { error } = await supabase.from("catalog_imports")
      .update({ verified: v, verified_at: v ? new Date().toISOString() : null }).eq("id", imp.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["catalog"] });
  }

  const countOk = imp?.imported_count === imp?.expected_count;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Import roadmap</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload <span className="font-mono">DSA_Roadmap_Audit.docx</span> (expected {EXPECTED} entries) or a CSV with a header row.
          The file is read in your browser; only parsed rows are saved to your private catalog. Nothing is invented — rows without a title are skipped.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-bold">Current catalog</h2>
        {imp ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="font-mono">{imp.source_name} · {imp.imported_count}/{imp.expected_count} entries · {imp.verified ? "verified" : "unverified"}</p>
            {!countOk && <p className="text-warning">Count differs from the expected {imp.expected_count}. Check the document before verifying.</p>}
            <label className="flex items-center gap-2">
              <Checkbox checked={imp.verified} disabled={!countOk} onCheckedChange={(c) => setVerified(c === true)} />
              I've checked these entries against the source document
            </label>
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">Nothing imported yet.</p>}
      </section>

      <section className="space-y-4">
        <Input type="file" accept=".docx,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {entries && (
          <>
            <p className={`text-sm ${entries.length === EXPECTED ? "text-success" : "text-warning"}`}>
              Parsed {entries.length} entries {entries.length === EXPECTED ? "— matches expected count" : `— expected ${EXPECTED}`}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border text-sm">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted font-mono text-xs uppercase"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Title</th><th className="p-2 text-left">Topic</th><th className="p-2 text-left">Difficulty</th></tr></thead>
                <tbody>{entries.map((e) => (
                  <tr key={e.position} className="border-t"><td className="p-2 font-mono">{e.position}</td><td className="p-2">{e.title}</td><td className="p-2">{e.topic}</td><td className="p-2">{e.difficulty}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <Button onClick={commit} disabled={busy || !entries.length}>Save {entries.length} entries to my catalog</Button>
          </>
        )}
      </section>
    </div>
  );
}
