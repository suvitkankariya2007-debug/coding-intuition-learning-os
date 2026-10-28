# Coding Intuition Learning Os

> **Local MCP note:** The MCP server is currently on the `feature/evidence-intelligence-layer` branch, not `main`. To run it locally, follow the [MCP setup guide](https://github.com/suvitkankariya2007-debug/coding-intuition-learning-os/blob/feature/evidence-intelligence-layer/mcp-worker/README.md) and clone that branch:

```sh
git clone --branch feature/evidence-intelligence-layer https://github.com/suvitkankariya2007-debug/coding-intuition-learning-os.git
cd coding-intuition-learning-os/mcp-worker
npm ci --no-audit --no-fund
npm run verify:local
```

The automated suite uses simulated upstream services; it does not prove live Supermemory authorization or an authenticated ChatGPT tool call. The repository is private, so external testers need access until the owner makes it public.


Build Coding Intuition Learning OS as a real full-stack private DSA study app on Lovable Cloud with authentication and RLS, a durable per-user learning database, dated spaced-repetition reviews, 7-30 day planner, contest warm-up, GitHub public-solution index, safe LeetCode/Codeforces observations, and optional Supermemory integration that never collects credentials in the browser. No fake solved data, no public learner notes. First build working auth and CRUD and a clear modern dark UI. Source curriculum must ultimately be imported from my 188-entry DSA_Roadmap_Audit(1).docx; do not invent entries if not yet available. Include import flow and clearly mark catalog incomplete until verified. Use free-tier features only and do not publish before auth/RLS tests. This is a real engineering MVP, not a UI mockup.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://coding-intuition-learning-os.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6e9db500-9028-4140-ba51-1903e21ae09d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
