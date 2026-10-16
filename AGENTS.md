<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules
- All learner data tables are owner-only via RLS on `user_id = auth.uid()`; browser queries rely on RLS, so never add anon policies. Why: notes and progress must stay private.
- Curriculum is per-user and only comes from user imports (`src/lib/parse-roadmap.ts`); never seed or invent entries. Why: source of truth is the user's roadmap document.
- SRS and planner logic live as pure functions in `src/lib/srs.ts` / `src/lib/planner.ts` with tests in `src/test/rules.test.ts`. Why: scheduling rules must be testable.
- Third-party credentials (Supermemory etc.) are only used server-side from secrets, never collected in the browser.
