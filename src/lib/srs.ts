// SM-2 spaced repetition. Grades 0-5; grade < 3 means "forgot".
export type SrsState = { ease: number; interval_days: number; repetitions: number };

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function review(state: SrsState, grade: number, today: string) {
  if (!Number.isInteger(grade) || grade < 0 || grade > 5) throw new Error("grade must be 0-5");
  let { ease, interval_days, repetitions } = state;
  if (grade < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    interval_days = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(interval_days * ease);
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  ease = Math.round(ease * 100) / 100;
  return { ease, interval_days, repetitions, due_date: addDays(today, interval_days) };
}
