import { addDays } from "./srs";

export type PlanReview = { item_id: string; title: string; due_date: string };
export type PlanNew = { item_id: string; title: string; position: number };
export type PlanDay = { date: string; reviews: PlanReview[]; fresh: PlanNew[] };

export function buildPlan(opts: {
  start: string;
  days: number;
  newPerDay: number;
  reviews: PlanReview[];
  unsolved: PlanNew[];
}): PlanDay[] {
  const { start, days, newPerDay } = opts;
  if (days < 7 || days > 30) throw new Error("plan length must be 7-30 days");
  if (newPerDay < 0) throw new Error("newPerDay must be >= 0");
  const queue = [...opts.unsolved].sort((a, b) => a.position - b.position);
  const out: PlanDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const reviews = opts.reviews.filter((r) =>
      i === 0 ? r.due_date <= date : r.due_date === date,
    );
    out.push({ date, reviews, fresh: queue.splice(0, newPerDay) });
  }
  return out;
}
