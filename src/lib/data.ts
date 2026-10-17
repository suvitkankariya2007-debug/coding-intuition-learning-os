import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEARNING_MODES, type LearningMode } from "./evidence-intelligence";

async function fetchCatalog() {
  const [items, progress, imp, reviews, platformEvidence, preferences] = await Promise.all([
    supabase.from("curriculum_items").select("*").eq("is_active", true).order("position"),
    supabase.from("item_progress").select("*"),
    supabase.from("catalog_imports").select("*").order("created_at", { ascending: false }).limit(1),
    supabase.from("review_log").select("item_id,grade,reviewed_at,mistake_class,hint_stage,confidence").order("reviewed_at", { ascending: false }).limit(2000),
    supabase.from("platform_evidence").select("item_id,source,provenance_id,observed_at,verdict,accepted,code_url").limit(2000),
    supabase.from("coaching_preferences").select("prefs").maybeSingle(),
  ]);
  if (items.error) throw items.error;
  if (progress.error) throw progress.error;
  if (imp.error) throw imp.error;
  if (reviews.error) throw reviews.error;
  if (platformEvidence.error) throw platformEvidence.error;
  if (preferences.error) throw preferences.error;
  const savedMode = preferences.data?.prefs && typeof preferences.data.prefs === "object" && !Array.isArray(preferences.data.prefs) ? preferences.data.prefs.learning_mode : null;
  const learningMode:LearningMode = LEARNING_MODES.includes(savedMode as LearningMode) ? savedMode as LearningMode : "interview";
  const latestReviewByItem = new Map<string, { grade: number; reviewed_at: string }>();
  for (const r of reviews.data) if (!latestReviewByItem.has(r.item_id)) latestReviewByItem.set(r.item_id, r);
  const byItem = new Map(progress.data.map((p) => [p.item_id, p]));
  return {
    items: items.data.map((i) => ({ ...i, progress: byItem.get(i.id) ?? null })),
    latestImport: imp.data[0] ?? null,
    latestReviewByItem,
    evidence: platformEvidence.data,
    learningMode,
  };
}

export const catalogQuery = queryOptions({ queryKey: ["catalog"], queryFn: fetchCatalog });
export type CatalogData = Awaited<ReturnType<typeof fetchCatalog>>;
export type CatalogRow = CatalogData["items"][number];

export const STATUSES = ["not_started", "attempted", "solved", "mastered"] as const;
export type Status = (typeof STATUSES)[number];
