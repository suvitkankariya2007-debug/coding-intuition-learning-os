import { describe, expect, it } from "vitest";
import { review } from "@/lib/srs";
import { buildPlan } from "@/lib/planner";
import { rowsToEntries } from "@/lib/parse-roadmap";

describe("spaced repetition", () => {
  const fresh = { ease: 2.5, interval_days: 0, repetitions: 0 };
  it("first good review is due next day", () => {
    expect(review(fresh, 4, "2026-10-16").due_date).toBe("2026-10-17");
  });
  it("second good review is due in 6 days", () => {
    const r1 = review(fresh, 4, "2026-10-16");
    expect(review(r1, 4, "2026-10-17").due_date).toBe("2026-10-23");
  });
  it("a failed review resets to 1 day", () => {
    const r = review({ ease: 2.5, interval_days: 20, repetitions: 4 }, 1, "2026-10-16");
    expect(r.repetitions).toBe(0);
    expect(r.due_date).toBe("2026-10-17");
  });
  it("ease never drops below 1.3", () => {
    expect(review({ ease: 1.3, interval_days: 1, repetitions: 0 }, 0, "2026-10-16").ease).toBe(1.3);
  });
});

describe("planner", () => {
  const base = { start: "2026-10-16", newPerDay: 2, reviews: [], unsolved: [] };
  it("rejects plans shorter than 7 or longer than 30 days", () => {
    expect(() => buildPlan({ ...base, days: 6 })).toThrow();
    expect(() => buildPlan({ ...base, days: 31 })).toThrow();
  });
  it("puts overdue reviews on day one", () => {
    const p = buildPlan({ ...base, days: 7, reviews: [{ item_id: "a", title: "A", due_date: "2026-10-01" }] });
    expect(p[0]?.reviews).toHaveLength(1);
  });
});

describe("roadmap import", () => {
  it("never invents entries: blank rows are skipped", () => {
    const rows = [["#", "Problem", "Topic"], ["1", "Two Sum", "Arrays"], ["2", "", ""]];
    expect(rowsToEntries(rows)).toHaveLength(1);
  });
});
