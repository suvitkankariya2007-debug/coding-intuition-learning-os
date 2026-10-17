import type { Evidence } from "./evidence-intelligence";

/** Normalize public platform submissions without inventing acceptance or problem matches. */
export type CodeforcesSubmission = {
  id: number; creationTimeSeconds: number; verdict?: string;
  problem?: { contestId?: number; index?: string; name?: string };
};
export type LeetCodeSubmission = {
  id: string | number; titleSlug: string; statusDisplay?: string;
  timestamp: string | number;
};
export type ProblemIndex = ReadonlyMap<string, string>;
const iso = (value: number) => Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
export const cleanCurriculumTitle = (s: string) => s.replace(/^\\s*\\d{1,4}\\.\\s+/, "").replace(/\\s+(?:⭐|NEW|\\(unmarked\\))\\s*$/i, "").trim();
export const normalizedTitle = (s: string) => cleanCurriculumTitle(s).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "");
export function indexTitles(items: { id: string; title: string }[]): Map<string, string> {
  const seen = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const item of items) {
    const key = normalizedTitle(item.title);
    if (seen.has(key) && seen.get(key) !== item.id) ambiguous.add(key);
    else seen.set(key, item.id);
  }
  for (const key of ambiguous) seen.delete(key);
  return seen;
}
export function normalizeCodeforces(rows: CodeforcesSubmission[], titles: ProblemIndex): Evidence[] {
  return rows.flatMap(s => {
    const itemId = s.problem?.name ? titles.get(normalizedTitle(s.problem.name)) : undefined;
    const observedAt = iso(s.creationTimeSeconds * 1000);
    if (!itemId || !observedAt || !Number.isSafeInteger(s.id)) return [];
    return [{ itemId, source: "codeforces" as const, observedAt, verdict: s.verdict ?? null,
      accepted: s.verdict === "OK", provenanceId: `cf:${s.id}` }];
  });
}
export function normalizeLeetCode(rows: LeetCodeSubmission[], slugs: ProblemIndex): Evidence[] {
  return rows.flatMap(s => {
    const itemId = slugs.get(s.titleSlug);
    const n = Number(s.timestamp);
    const observedAt = iso(n < 1e11 ? n * 1000 : n);
    if (!itemId || !observedAt || !/^[a-zA-Z0-9_-]+$/.test(String(s.id))) return [];
    return [{ itemId, source: "leetcode" as const, observedAt, verdict: s.statusDisplay ?? null,
      accepted: s.statusDisplay === "Accepted", provenanceId: `lc:${s.id}` }];
  });
}
