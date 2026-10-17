/**
 * Evidence-based DSA recommendation engine.
 * Pure and deterministic: no unverified submission is silently marked solved.
 * Designed to run over authenticated, RLS-scoped database records.
 */
export type EvidenceSource = "leetcode" | "codeforces" | "github" | "manual" | "supermemory";
export type Evidence = {
  itemId: string;
  source: EvidenceSource;
  observedAt: string;
  verdict?: string | null;
  accepted?: boolean;
  codeUrl?: string | null;
  provenanceId: string;
};
export type LearningItem = {
  id: string;
  title: string;
  position: number;
  topic: string;
  difficulty?: "easy" | "medium" | "hard" | null;
  dueDate?: string | null;
  lastReviewedAt?: string | null;
  recallGrade?: 0 | 1 | 2 | 3 | null;
  attemptCount?: number;
  status?: "not_started" | "attempted" | "solved" | "mastered";
  priority?: number;
};
export type Recommendation = {
  itemId: string;
  title: string;
  score: number;
  reason: string[];
  evidence: { accepted: number; rejected: number; codeFiles: number; latestAt: string | null };
};
const DAY = 86400000;
function validDate(x: string | null | undefined): number | null {
  if (!x) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : null;
}
function verdictAccepted(e: Evidence) {
  if (e.source === "github" || e.source === "supermemory") return false;
  return e.accepted === true || (e.source === "codeforces" && e.verdict === "OK") ||
    (e.source === "leetcode" && e.verdict === "Accepted");
}
export function recommendDSA(
  items: LearningItem[],
  evidence: Evidence[],
  options: { now?: string; limit?: number; focusTopics?: string[]; mode?: "daily" | "contest" } = {},
): Recommendation[] {
  const now = validDate(options.now) ?? Date.now();
  const requestedLimit = options.limit ?? 10;
  const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.min(50, Math.floor(requestedLimit))) : 10;
  const focus = new Set((options.focusTopics ?? []).map(t => t.toLowerCase()));
  const byId = new Map<string, Evidence[]>();
  for (const e of evidence) {
    if (!e.itemId || !validDate(e.observedAt) || !e.provenanceId || !["leetcode", "codeforces", "github", "manual", "supermemory"].includes(e.source)) continue;
    const group = byId.get(e.itemId) ?? [];
    if (!group.some(x => x.source === e.source && x.provenanceId === e.provenanceId)) group.push(e);
    byId.set(e.itemId, group);
  }
  return items.map(item => {
    const ev = byId.get(item.id) ?? [];
    const accepted = ev.filter(verdictAccepted).length;
    const rejected = ev.filter(e => (e.source === "codeforces" || e.source === "leetcode") &&
      !!e.verdict && !verdictAccepted(e)).length;
    const codeFiles = ev.filter(e => e.source === "github" && !!e.codeUrl).length;
    const latest = ev.map(e => validDate(e.observedAt)).filter((x): x is number => x !== null);
    const due = validDate(item.dueDate);
    const daysOverdue = due === null ? 0 : Math.max(0, Math.floor((now - due) / DAY));
    const isDue = due !== null && due <= now;
    const weakRecall = item.recallGrade != null && item.recallGrade <= 1;
    const attempted = item.status === "attempted" || (item.attemptCount ?? 0) > 0 || rejected > 0;
    const solved = item.status === "solved" || item.status === "mastered" || accepted > 0;
    const reason: string[] = [];
    let score = 0;
    if (isDue) { score += 55 + Math.min(daysOverdue, 20); reason.push(daysOverdue ? `Review overdue by ${daysOverdue} day(s)` : "Review due now"); }
    if (weakRecall) { score += 30; reason.push("Previous recall was difficult"); }
    if (rejected) { score += Math.min(rejected, 5) * 6; reason.push(`${rejected} observed non-accepted submission(s)`); }
    if (attempted && !solved) { score += 18; reason.push("Attempted but no verified acceptance recorded"); }
    if (!attempted && !solved) { score += options.mode === "contest" ? 0 : 10; reason.push("New curriculum problem"); }
    if (solved && !isDue && !weakRecall) score -= 25;
    if (codeFiles) reason.push(`${codeFiles} GitHub solution file(s) available for revision; not acceptance proof`);
    if (accepted) reason.push(`${accepted} accepted submission(s) observed`);
    if (focus.has(item.topic.toLowerCase())) { score += 22; reason.push("Matches selected focus topic"); }
    score += Math.max(0, Math.min(item.priority ?? 0, 10));
    // Curriculum order only breaks ties; it never overrides a due or weak problem.
    return { itemId: item.id, title: item.title, score,
      reason, evidence: { accepted, rejected, codeFiles,
        latestAt: latest.length ? new Date(Math.max(...latest)).toISOString() : null },
      position: item.position, isNew: !attempted && !solved, due: isDue };
  }).filter(r => options.mode !== "contest" || !r.isNew || r.due)
    .sort((a,b) => b.score - a.score || a.position - b.position || a.itemId.localeCompare(b.itemId))
    .slice(0,limit)
    .map(({position: _position,isNew: _isNew,due: _due,...rest}) => rest);
}
