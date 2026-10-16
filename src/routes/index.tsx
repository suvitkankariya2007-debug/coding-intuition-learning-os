import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coding Intuition — Private DSA Learning OS" },
      { name: "description", content: "Import your DSA roadmap, review on a spaced schedule, and plan 7-30 days of practice. Private by default." },
      { property: "og:title", content: "Coding Intuition — Private DSA Learning OS" },
      { property: "og:description", content: "Spaced-repetition DSA study with a private, per-user learning database." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen grid-bg">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-24">
        <span className="font-mono text-xs uppercase tracking-widest text-primary">Coding Intuition / Learning OS</span>
        <h1 className="text-5xl font-bold leading-tight md:text-6xl">
          Build intuition, <span className="text-primary">not streaks.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Your own DSA roadmap, dated spaced-repetition reviews and a 7–30 day planner. Everything you write stays private to your account.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Sign in</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/dashboard">Open dashboard</Link></Button>
        </div>
        <ul className="grid gap-4 font-mono text-sm text-muted-foreground md:grid-cols-3">
          <li className="rounded-lg border bg-card p-4">01 — Import roadmap (.docx / CSV)</li>
          <li className="rounded-lg border bg-card p-4">02 — Grade recall, get a due date</li>
          <li className="rounded-lg border bg-card p-4">03 — Plan the next 7–30 days</li>
        </ul>
      </div>
    </main>
  );
}
