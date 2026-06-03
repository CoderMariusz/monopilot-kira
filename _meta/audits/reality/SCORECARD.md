# MonoPilot Kira — Repo-Wide Reality Scorecard (Phase 0, 2026-06-02)

> Ground-truth audit of declared tasks vs. what actually exists in `apps/web` +
> `packages/db`. 16 modules fanned out to Sonnet auditors; evidence in
> `_meta/audits/reality/<module>-REALITY.md` and per-module `STATUS.md`.

## Walking Skeleton verdict (PRIORITY)

**YES** — a user can log in (real Supabase Auth) and navigate a clickable,
Supabase-backed product today. `pnpm --filter web build` = **PASS** (Next 16.2.4,
0 TS errors). Evidence: `_meta/audits/reality/SKELETON-REALITY.md`.

Residual skeleton gaps (none block DoD #1–5, all are Wave-1 follow-ups):
- **T-129 SEC-RLS** — anon-exposed public tables with RLS OFF on the live Supabase DB (cross-tenant leak). Security P0.
- **T-130 RBAC nav gating** — every sidebar item visible to any authenticated user.
- 8 module landing pages are intentional Wave-0 stubs (`ModuleStubNotice`, no DB query): planning, scheduler, oee, finance, maintenance, npd, reporting, multi-site.
- `/technical` page queries the wrong table (`lot`/`bom_item` placeholder, not a technical-domain table).
- Topbar role-switch widget replaced by UserMenu (minor parity gap); shell parity evidence is a trace zip, not screenshot+axe per policy.

## Scorecard

| Module | Declared | ✅ Impl | 🟡 Stub | ⛔ Missing | 👻 Phantom | 🧩 Extra | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| 00-foundation | 129 | 77 | 10 | 34 (+8 deferred) | 0 | migr 037–050 | spine; P0 holes T-111/112/121/129 |
| 01-npd | 139 | 0 | 8 | 130 | 0 | 1 | T-001 product table blocks 130+ |
| 02-settings | 153 | ~67 | ~62 | ~13 | 0 | ~9 | all 57 UI capped 🟡 (no parity evidence) |
| 03-technical | 91 | 0 | 8 | 83 | 0 | 6 | zero domain schema; D365 UI namespace mismatch |
| 04-planning-basic | 66 | 0 | 0 | 66 | 0 | 0 | `src/` path remap needed for all 66 |
| 05-warehouse | 58 | 0 | 1 | 57 | 0 | 4 | LP/GRN schema absent → blocks scanner/prod/ship |
| 06-scanner-p1 | 49 | 0 | 0 | 49 | 0 | 4 | `apps/scanner` workspace doesn't exist |
| 07-planning-ext | 58 | 0 | 0 | 58 | 0 | 1 | Python solver service absent; blocked on 04 |
| 08-production | 56 | 0 | 2 | 54 | 0 | 4 | owns wo_outputs/oee_snapshots — schema absent |
| 09-quality | 65 | 0 | 1 | 64 | 0 | 0 | T-064 consume gate absent; src/ path mismatch |
| 10-finance | 32 | 0 | 1 | 31 | 0 | 1 | NUMERIC mandatory; D365 R15 layer absent |
| 11-shipping | 32 | 0 | 3 | 29 | 0 | 4 | apps/worker + d365 pkg phantom |
| 12-reporting | 27 | 0 | 1 | 26 | 0 | 1 | packages/reporting + all source tables absent |
| 13-maintenance | 30 | 0 | 1 | 29 | 0 | 2 | e-sign/worker foundation deps; 3-way cross-mod |
| 14-multi-site | 31 | 0 | 1 | 30 | 0 | 1 | migration-number collision; packages/domain phantom |
| 15-oee | 25 | 0 | 1 | 24 | 0 | 4 | read-only on 08's oee_snapshots (absent) |
| **TOTAL** | **1041** | **~144** | **~101** | **~777** | **0** | — | ~14% impl / ~10% stub / ~75% missing |

## Reconciliation
- Task files == manifest `task_count` for **all 16 modules** (the stale 126/125 mismatch is gone).
- Only `00-foundation` had a STATUS.md; it covered 64/129 and claimed "61/61 DONE" — corrected. STATUS.md created for the other 15 modules.

## Carry-forward backlog (feeds Phase 1)
From foundation STATUS: **T-062** (done), **T-064** (⬜ consume gate), **T-069** (done), **T-072** (⬜), **T-073** (⬜), **T-080** (done), **CF-T015→T-109** (done).
Net open carry-forwards: **T-064, T-072, T-073**.

## Phantom infra (declared in task scope_files but no creating task — Phase 1 must add)
- `apps/worker` (foundation T-111) — blocks reporting, shipping/D365, maintenance, oee outbox
- `apps/scanner` workspace — all of 06-scanner-p1
- `packages/reporting` — all of 12-reporting
- `packages/domain` — 14-multi-site T-009/010/011/013/014
- `packages/integrations-d365` + `packages/events` — 11-shipping T-029
- `packages/barcode-parser` → already exists as `packages/gs1` (reconcile, don't duplicate)

## Cross-cutting risks (recurring across modules)
1. **Per-module RBAC permission enum is a P0 first-commit blocker** in every greenfield module (npd T-101, technical T-091, planning T-066, production T-056, finance T-001, reporting T-001, maintenance T-001, oee T-001, …). ESLint enum-lock guard fails compilation until each lands.
2. **`apps/web/src/` path mismatch** — planning-basic, planning-ext, quality, maintenance, multi-site declare scope_files under a non-existent `src/` layer. Must remap to `apps/web/app/` + `apps/web/actions/` before implementation.
3. **Foundation primitives gate almost everything** — T-111/T-112 (worker+outbox), T-121 (rate-limit), T-124 (e-sign), T-125 (withOrgContext) are transitive deps for most downstream waves.
4. **Migration numbering collision** — 14-multi-site declares `0040_`–`0053_` (4-digit/underscore) vs existing `000-050` (3-digit/hyphen); `040-tenant-l2.sql` slot taken.
5. **Canonical-ownership integrity** holds in declarations (no observed cross-writes), but `oee_snapshots` (08 owns / 15 reads) and `wo_outputs` (08) vs `schedule_outputs` (planning) must be enforced when schema lands.

## Top-of-funnel for Phase 1/2
- **T-129 SEC-RLS first** (security P0; test on a Supabase branch).
- Then foundation gap-fill (T-111/112/121/124 + remaining primitives) — unblocks the most.
- Then the two most-built modules in brownfield mode: **00-foundation** completion, **02-settings** parity-evidence + T-122/SCIM fixes.
