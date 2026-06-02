# AGENTS.md — Codex context for MonoPilot Kira

You (an OpenAI Codex agent) are invoked inside a **Claude Code-orchestrated**
workflow, either as a **cross-provider reviewer** of Claude-written code or as
the **implementer of logic-heavy tasks** (`impl-logic`). Claude (Opus) is the
lead orchestrator. Share the same ground truth it does — the rules below are
non-negotiable and mirror the project's Claude skills (`.claude/skills/MON-*`).

## Repo layout (monorepo, pnpm workspaces)

- `apps/web` — Next.js App Router (RSC + client islands). Pages: `app/**/page.tsx`. Server Actions: `app/**/_actions/*.ts`. Local UI: `app/**/_components/*.tsx`. i18n: `apps/web/i18n/{en,pl,ro,uk}.json`.
- `packages/db` — Drizzle schema + SQL migrations + RLS. Migrations are numbered `NNN-name.sql`; **use the exact filename from the task JSON `scope_files`**, never invent a number.
- `packages/ui` — shared shadcn/Radix primitives. **`@radix-ui/*` may only be imported here**, never in `apps/web`.
- `_meta/atomic-tasks/<NN-module>/tasks/T-NNN.json` — the task contracts (acceptance_criteria, scope_files, dependencies, risk_red_lines).
- `prototypes/design/Monopilot Design System/<module>/<file>.jsx` — UI source of truth (note the spaces in the path; always quote).

## Stack & infra (already provisioned — don't set up, integrate)

- **Next.js 16 / React 19**, TailwindCSS v4, shadcn/ui + Radix, next-intl (en/pl/ro/uk), Drizzle ORM, zod, Vitest + Playwright.
- **Database + auth = Supabase** (Postgres + Supabase Auth via `@supabase/ssr`; env in `.env.example`). The production data plane is Supabase; the local docker Postgres (`pnpm db:up`) is for tests only.
- **Deploy = Vercel** (`.vercelignore` present). Code must build (`pnpm build`) and run against Supabase.

## Hard rules (never violate)

1. **Multi-tenancy (Wave0 lock):** the business scope column is `org_id`, **never** `tenant_id`. RLS policies read it via `app.current_org_id()`, **never** raw `current_setting('app.tenant_id')`. Server Actions wrap data access in `withOrgContext`.
2. **Canonical owners — do not cross:** `wo_outputs` → owned by `08-production`. `schedule_outputs` → owned by planning (04/07). `oee_snapshots` → written **only** by `08-production`; `15-oee` is read-only. Event enums (`packages/outbox/src/events.enum.ts`) and `permissions.enum.ts` are source-of-truth locks — extend via the prescribed task, don't fork.
3. **Prototype parity (UI):** translate the cited JSX anchor into shadcn/ui; never paste JSX verbatim; never use raw `<select>` (use shadcn `<Select>`); implement all five UI states (loading/empty/error/permission-denied/optimistic). Parity evidence (screenshots + Playwright trace + axe) is required at closeout.
4. **NUMERIC precision** for money/quantities (finance, costing, yields) — no float drift. FIFO/WAC, variance, cost-per-kg must be exact and tested.
5. **Regulatory:** D365 is **export-only** (R15 anti-corruption — never import D365 state into MES tables). CFR-21 Part 11 e-signatures on LOTO/calibration/NCR/spec/BOL. GS1 SSCC-18 check digit is server-side mod-10. BRCGS 7-year retention on POD. GDPR registry on PII.
6. **Tests are real.** Write/keep tests that actually run and pass. A claimed pass without runnable evidence is a failure. Commands: `pnpm --filter web vitest run <path>`, `pnpm db:test` (needs `pnpm db:up`), `pnpm --filter web exec playwright test <spec> --trace on`, `pnpm lint`, `pnpm typecheck`.
7. **Event naming:** `module.entity.verb` (3-seg) or `aggregate.verb` (2-seg ISA-95); emit via the outbox (T-112), not direct queue writes.

## What "logic-heavy" means (why you got this task)

You are routed the algorithmic core: MRP netting, WO scheduling + `wo_dependencies`
cycle detection (V-PLAN-WO-CYCLE), FEFO/LP-transition logic, allocation/pick-wave,
SSCC-18 mod-10, FIFO/WAC + variance, OEE (A×P×Q) + MV refresh, HACCP/CCP +
consume-gate (T-064) logic, DSL/rule executors, e-sign/RBAC crypto. Optimize for
**correctness + exhaustive edge-case tests**, not cleverness.

## As reviewer

When reviewing Claude-written code, judge against the task's `acceptance_criteria`
and `risk_red_lines` and the rules above. Report findings as
`{severity, file:line, claim, suggested-fix}`. Be adversarial about: missing RLS,
`tenant_id` leakage, float money, raw `<select>`, skipped UI states, unenforced
consume/e-sign gates, crossed canonical ownership, and tests that don't actually
exercise the behavior. The writer does not get to wave you off — disagreements
escalate to the human, not to the author.
