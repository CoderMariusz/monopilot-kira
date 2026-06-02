---
description: "Wave 0 — guarantee a clickable, DB-backed Walking Skeleton on Vercel: working login + app shell (sidebar/topbar/menu) + navigation + real data"
argument-hint: "[--verify-only]"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit, TodoWrite
model: opus
---

# /kira:skeleton — Walking Skeleton (Wave 0)

This is the human's **Definition of Done baseline** and the first execution
objective, ahead of broad module work: *a user can log in and click through a
menu-driven product whose pages show real data from the database* — live on the
Vercel deployment.

**BROWNFIELD — the skeleton ALREADY EXISTS. Audit first, fill only the gaps,
never rebuild what works.** Login and the app shell were hand-added (not tracked
as tasks), so their completeness/quality is unknown — but they are there. Your
job is to **verify what exists, produce a precise gap list, and implement ONLY
the gaps**, so when broad work starts we're completing, not re-building. Do not
replace or rewrite a working login/shell/page just to "own it" with a task.

**Infra is already provisioned — integrate, don't set it up.** Deploy is
**Vercel**; database + auth is **Supabase** (Postgres + Supabase Auth, wired via
`@supabase/ssr`, foundation T-011; env in `.env.example`). "Real data" means
pages query **Supabase** through Drizzle / Server Actions, not mocks. The local
`pnpm db:up` Postgres is for tests only — production data plane is Supabase.

`--verify-only`: stop after the audit + gap list; implement nothing.

## Definition of Done (verify each against what EXISTS; only fix what fails)

1. **Login works** — real auth via **Supabase Auth**, establishes `org_id` session context; logout works; unauthenticated users are redirected to login.
2. **App shell renders** — sidebar + topbar + main layout, matching the prototype shell (parity, not pixel-exact).
3. **Navigation works** — the menu lists the modules and every link routes to a real page (no 404s, no dead links).
4. **Real data** — at least the landing/dashboard and one page per top-level module render **data fetched from Supabase** (Drizzle / Server Actions), not mocks/hardcoded fixtures.
5. **Deploys green** — `pnpm build` succeeds and the **Vercel** deployment serves the above against **Supabase**.

## Procedure

1. **Audit what's there (reuse `05-AUDIT-PLAYBOOK.md` → Walking Skeleton section).**
   Fan out Sonnet agents to inventory the EXISTING code: `apps/web/app/(auth)/**`
   + middleware (auth); root layout + shell components vs
   `prototypes/design/Monopilot Design System/settings/shell.jsx` and
   `_meta/prototype-labels/prototype-index-foundation-shell.json`; the nav
   manifest/sidebar; which reachable pages use real Supabase data vs mocks. Opus
   writes a **gap list** per DoD point: what already works (✅ leave it), what is
   stubbed/partial (🟡 complete it), what is missing (⛔ add it), what is broken
   (🔴 fix it). Be explicit that ✅ items are NOT to be rewritten.

2. **Materialize tasks for GAPS ONLY.** For each ⛔/🟡/🔴 gap that has no owning
   task, create a proper `T-NNN.json` (via `prd-decompose-hybrid`, Opus) in the
   right module (auth/shell/nav → `00-foundation` or `02-settings` per the
   prototype's home), marked high priority + `risk_tier: high`. Register in
   manifest + STATUS. These become **Wave 0**. Do NOT create tasks that rebuild ✅
   working pieces.

3. **Implement the Wave-0 gap tasks ONLY (routed, in worktrees per `03-WORKTREE-PROTOCOL.md`).**
   Extend/repair the existing code; do not rewrite ✅ working pieces. Touch a
   working file only where a gap genuinely requires it, and say so in the diff.
   - Login/auth wiring → `impl-standard` (Sonnet) or `impl-logic` (Codex) for crypto/session edges; load `MON-foundation-primitives` + `MON-multi-tenant-site`.
   - App shell + sidebar + topbar + nav → `impl-ui` (Opus); load `MON-t3-ui`; honor the shell prototype anchors; all five UI states.
   - Real-data wiring → `impl-standard` T2 Server Actions + Drizzle queries feeding the pages (replace mocks); `withOrgContext`, RLS-safe.

4. **Gates (all apply):**
   - Gate 1 real tests: `pnpm --filter web vitest run`, `pnpm db:up && pnpm db:test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
   - Gate 2 UI parity: shell + login screenshots + Playwright trace + axe vs the prototype anchors.
   - **E2E walking-skeleton spec:** a Playwright test that logs in → lands on the shell → clicks through the menu → asserts a DB-backed value renders. This spec is the executable DoD.
   - Gate 4 review: high-risk → cross-provider (`/kira:review`).

5. **Verify deploy (Vercel + Supabase, already provisioned).** Confirm `pnpm build`
   is green and the Supabase env vars are wired for the deployed app. Use the
   **Supabase MCP** (`list_tables`, `get_advisors`, `get_logs`) read-only to confirm
   the live schema + RLS match what the skeleton needs (auth tables, `org_id`
   policies, the tables the sampled pages query). If Vercel CLI/credentials are
   available, trigger/inspect a preview deploy and smoke-test login + nav against
   Supabase there; otherwise report build green + Supabase schema verified and flag
   the Vercel deploy check as the final human/CI step. Never fake a deploy result.

## Report (notify the phone)

State each of the 5 DoD points as PASS/FAIL with evidence, the Wave-0 tasks
created + their status, and the merged SHAs. If everything is PASS, say plainly:
"Walking Skeleton is live and clickable with DB data." Then hand back to
`/kira:run-wave 1` for the rest of the plan.
