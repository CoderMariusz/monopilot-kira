# Decision — Post-Skeleton Orchestration Plan (2026-06-02)

Recorded after Wave 0 (Walking Skeleton) shipped, so a fresh Claude context can pick up exactly where we are.

## Status snapshot
- **Wave 0 Walking Skeleton: DONE**, committed + pushed to `origin/kira/long-run`:
  - `42258d53` — skeleton real-data wiring (DoD #4) + logout fix (DoD #1).
  - `b399e910` — T-129 SEC-RLS hardening task created.
- DoD #1–#5 all ✅ (build green; live Supabase verified via MCP). Only open Wave-0 item: a Vercel browser smoke (code already on branch).
- **False positive corrected:** "missing `middleware.ts`" — this is Next.js 16 where `proxy.ts` *is* the middleware (build shows `ƒ Proxy (Middleware)`). Do not "fix" it.
- Scale: **1046 atomic tasks** across 16 modules. `00-foundation` now T-001..T-129 (manifest count 129).

## The next step = Prompt 0 (master orchestration)
`/kira:run-wave 1` **cannot run yet** — there is no `_meta/plans/waves/wave-1.json`. Wave 1 is undefined until the planning phases run. Therefore the next action is the **master orchestration prompt** (`docs/workflow/00-MASTER-ORCHESTRATION-PROMPT.md`), run in a **fresh local Opus context** with `codex-plugin-cc` authenticated. It drives:

Phase 0 audit → Phase 1 consolidate → Phase 2 **plan (generates `wave-N.json`)** → Phase 4 run-wave. Wave 0 is reserved/done; Wave 1 = tasks whose deps Wave 0 satisfies.

**Trigger:** user will write **"leć z Prompt 0"**.

## Agreed decisions to apply
1. **Full pipeline** — real Phase 0 audit (not a shortcut plan-only); pause at the plan gate for user approval before run-wave.
2. **Agent concurrency limit = 7.**
3. **Codex = primary implementer** (`docs/workflow/01-MODEL-ROUTING.md`): standard T1/T2/T5 + logic-heavy → Codex `/codex:rescue`; Sonnet only for trivial + the Phase-0 audit + low-risk review; Haiku for mechanics; Opus for hard/architecture/UI + high-risk review. Verify `/codex:status` first.
4. **T-129 (SEC-RLS) goes first** in the pipeline (p0 security). Pre-existing debt surfaced during skeleton live-verify: RLS-off + `anon,authenticated` SELECT grants on PostgREST-exposed tables (`tenant_variations`, `consumed_approval_tokens`, `tenant_migrations` carry `org_id`; `modules`, `allergens`, `line_machines`, `role_categories`, `tenant_migrations_legacy_t038`, `audit_log_2026_01..12`); + rls_enabled_no_policy on `tenant_idp_config`/`tenants`; + anon-EXECUTE on ~11 SECURITY DEFINER fns; + leaked-password protection off. Test migrations on a **Supabase branch** (MCP `create_branch` → `apply_migration` → `get_advisors` = 0 ERROR + org-isolation) before the shared DB.
5. Use **Agent fan-out, not the Workflow tool**; run lean; phone updates via ntfy (topic `monopilot-kira-mk7f3a9`).

## Environment reality (important)
**Vercel + Supabase are a TEST environment right now**, not production. Safe to run migrations/seeds/app against the live Supabase DB freely; once the build is fully green the DB will be **wiped and re-prepared for real orgs**. "Real data" still means querying Supabase (never mocks) — it's just not customer data yet.

## Branch
All work on `kira/long-run` (skeleton committed there). GitHub offers a PR at `…/pull/new/kira/long-run` if a PR-based flow is preferred over branch work.
