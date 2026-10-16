import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const catalogQuery = queryOptions({
  queryKey: ["catalog"],
  queryFn: async () => {
    const [items, progress, imp] = await Promise.all([
      supabase.from("curriculum_items").select("*").order("position"),
      supabase.from("item_progress").select("*"),
      supabase.from("catalog_imports").select("*").order("created_at", { ascending: false }).limit(1),
    ]);
    if (items.error) throw items.error;
    if (progress.error) throw progress.error;
    if (imp.error) throw imp.error;
    const byItem = new Map(progress.data.map((p) => [p.item_id, p]));
    return {
      items: items.data.map((i) => ({ ...i, progress: byItem.get(i.id) ?? null })),
      latestImport: imp.data[0] ?? null,
    };
  },
});

export type CatalogRow = Awaited<ReturnType<typeof catalogQuery.queryFn & {}>>["items"][number];
