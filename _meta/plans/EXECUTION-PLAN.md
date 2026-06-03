# MonoPilot Kira — Execution Plan (Phase 2, 2026-06-02)
Generated from the consolidated acyclic DAG. **1041 tasks** (126 ✅ done / 915 pending) across **14 dependency waves**.
> Waves = the **global dependency layering** (done prerequisites pinned to Wave 0). Actual execution is **module-by-module** in the rollout order below (`/kira:run-module`), each module running its tasks in wave order, ≤7 concurrent worktrees, cross-module deps gated by other modules' STATUS. A wave is a dependency layer, **not** a 'run 159 tasks at once' instruction.
## Wave 0 — Walking Skeleton (DONE ✅)
Login (Supabase Auth) + app shell + nav + DB-backed pages are live; `pnpm build` green (Phase 0 `SKELETON-REALITY.md`). The 126 done tasks (foundation 77, settings 48, +misc) are pinned to Wave 0 and skipped by Phase 4 brownfield. Residual skeleton follow-ups (T-129 RLS, T-130 RBAC-nav) are scheduled below, not in Wave 0.
## The four gates (per `02-QUALITY-GATES.md`)
- **G1 — tests run for real**, output captured (every task).
- **G2 — prototype parity** (T3-ui only): literal JSX anchor + screenshot/axe evidence.
- **G3 — deps satisfied** before start (encoded by wave order + cross-module STATUS).
- **G4 — cross-provider review** for high-risk; cheaper self-check for low-risk. Writer never signs off its own work.
## Model routing summary (per `01-MODEL-ROUTING.md`)
- **Codex** primary implementer: `impl-standard` 446 + `impl-logic` 104 = **550 tasks**.
- **Opus** UI: `impl-ui` **339** (parity is architectural) + `plan` 35 (T0/docs).
- **Sonnet/Codex** tests: `test` **117**.
- Review pairing: Codex-written→Claude reviews (Opus high / Sonnet low); Opus-UI→Codex reviews.
- **Risk tiers:** 676 high / 365 low (T1-schema + T3-ui always high; +security/money/regulatory).
## Module rollout order (foundation-first, brownfield)
Run the most-built first, complete it, sign off, then advance:

| # | Module | Pending | Note |
|---|---|---:|---|
| 1 | 00-foundation | 51 | complete P0 holes: T-129 RLS→T-111/112 worker→T-121 rate-limit→T-124 e-sign |
| 2 | 02-settings | 106 | parity evidence for 57 UI + T-122 migration + SCIM fix |
| 3 | 01-npd | 139 | greenfield: T-001 product schema gates 130+ |
| 4 | 03-technical | 91 | greenfield: domain schema + D365 namespace |
| 5 | 04-planning-basic | 66 | greenfield: src/ remap; MRP/WO |
| 6 | 05-warehouse | 58 | greenfield: LP/FEFO — gates scanner/prod/ship |
| 7 | 06-scanner-p1 | 49 | needs apps/scanner workspace |
| 8 | 07-planning-ext | 58 | needs Python solver svc; blocked on 04 |
| 9 | 08-production | 56 | owns wo_outputs/oee_snapshots |
| 10 | 09-quality | 65 | T-064 consume gate |
| 11 | 10-finance | 32 | NUMERIC-exact; D365 R15 |
| 12 | 11-shipping | 32 | deepest chain (critical path) |
| 13 | 12-reporting | 26 | needs packages/reporting + source tables |
| 14 | 13-maintenance | 30 | e-sign/worker deps |
| 15 | 14-multi-site | 31 | migration renumber; packages/domain |
| 16 | 15-oee | 25 | read-only on 08 oee_snapshots |

## Critical path (longest structural chain = 16)
Bottom 6 are ✅ done (foundation base), so the **effective pending critical path is the 10-task 11-shipping chain** — the min wall-clock for full completion:

- `11-shipping/T-032`
- `11-shipping/T-025`
- `11-shipping/T-023`
- `11-shipping/T-020`
- `11-shipping/T-019`
- `11-shipping/T-018`
- `11-shipping/T-015`
- `11-shipping/T-011`
- `11-shipping/T-006`
- `11-shipping/T-001`
- `00-foundation/T-125`
- `00-foundation/T-011`
- `00-foundation/T-010`
- `00-foundation/T-006`
- `00-foundation/T-002`
- `00-foundation/T-001`

## Per-wave summary
| Wave | Tasks | Pending | Top modules | Writers (std/logic/ui/test/plan) | Risk H/L |
|---:|---:|---:|---|---|---|
| 1 | 202 | 202 | 02:63, 00:40, 03:18, 08:16 | 94/17/57/19/15 | 152/50 |
| 2 | 124 | 124 | 02:23, 01:17, 08:14, 07:12 | 69/20/25/10/0 | 88/36 |
| 3 | 114 | 114 | 01:23, 03:12, 05:11, 02:10 | 70/17/19/7/1 | 63/51 |
| 4 | 137 | 137 | 01:22, 03:19, 07:12, 08:11 | 56/17/49/11/4 | 76/61 |
| 5 | 119 | 119 | 01:26, 03:13, 06:11, 04:10 | 32/12/57/16/2 | 72/47 |
| 6 | 83 | 83 | 01:12, 13:11, 09:9, 12:9 | 18/3/45/16/1 | 54/29 |
| 7 | 69 | 69 | 01:16, 03:12, 04:12, 05:4 | 8/4/45/10/2 | 53/16 |
| 8 | 33 | 33 | 01:9, 04:9, 11:8, 05:2 | 7/2/18/5/1 | 21/12 |
| 9 | 17 | 17 | 11:8, 01:4, 04:3, 05:1 | 1/1/9/5/1 | 11/6 |
| 10 | 7 | 7 | 01:3, 11:3, 05:1 | 0/1/2/4/0 | 4/3 |
| 11 | 2 | 2 | 01:1, 11:1 | 0/1/0/1/0 | 0/2 |
| 12 | 4 | 4 | 11:4 | 1/1/2/0/0 | 3/1 |
| 13 | 3 | 3 | 11:3 | 0/0/3/0/0 | 3/0 |
| 14 | 1 | 1 | 11:1 | 0/0/0/1/0 | 0/1 |

## Serialization points (cross-cutting files — execution must serialize edits)
- `packages/db/src/schema/index.ts` — touched by 68 tasks (append-serialize; never two in parallel)
- `packages/rbac/src/permissions.enum.ts` — touched by 24 tasks (append-serialize; never two in parallel)
- `packages/rbac/src/__tests__/permissions.test.ts` — touched by 17 tasks (append-serialize; never two in parallel)
- `apps/web/messages/en/shipping.json` — touched by 14 tasks (append-serialize; never two in parallel)
- `apps/web/messages/pl/shipping.json` — touched by 14 tasks (append-serialize; never two in parallel)
- `packages/db/migrations/` — touched by 13 tasks (append-serialize; never two in parallel)
- `prototypes/design/Monopilot Design System/npd/fa-screens.jsx [ref]` — touched by 13 tasks (append-serialize; never two in parallel)
- `packages/events/src/shipping.ts` — touched by 13 tasks (append-serialize; never two in parallel)
- `prototypes/design/Monopilot Design System/npd/modals.jsx [ref]` — touched by 10 tasks (append-serialize; never two in parallel)
- `prototypes/design/Monopilot Design System/shipping/modals.jsx [ref]` — touched by 10 tasks (append-serialize; never two in parallel)
- `apps/web/package.json` — touched by 9 tasks (append-serialize; never two in parallel)
- `apps/worker/src/index.ts` — touched by 9 tasks (append-serialize; never two in parallel)

The per-module RBAC permission enum (`packages/rbac/src/permissions.enum.ts`) is the biggest hotspot: each module's first task appends its `mod.*` strings. These are the P0 first-commit blockers — run each module's enum task **first + alone** in its wave.

## Wave 1 — full detail (202 tasks)
| Task | Module | Type | Writer | Risk | Gates | Status |
|---|---|---|---|---|---|---|
| T-028 | 00-foundation | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-037 | 00-foundation | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-063 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-064 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-065 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-068 | 00-foundation | T4-wiring-test | test | high | G1-test G3-deps G4-xprovider | pending |
| T-072 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-073 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-074 | 00-foundation | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-075 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-077 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-078 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-082 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-083 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-085 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-086 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-087 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-089 | 00-foundation | T4-wiring-test | test | high | G1-test G3-deps G4-xprovider | pending |
| T-091 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-092 | 00-foundation | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-094 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-095 | 00-foundation | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-096 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-097 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-098 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-099 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-100 | 00-foundation | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-101 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-102 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-103 | 00-foundation | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-104 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-105 | 00-foundation | T4-wiring-test | test | high | G1-test G3-deps G4-xprovider | pending |
| T-106 | 00-foundation | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-107 | 00-foundation | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-108 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-110 | 00-foundation | T5-seed | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-111 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-113 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-124 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-129 | 00-foundation | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-011 | 02-settings | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-012 | 02-settings | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-013 | 02-settings | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-041 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-042 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-043 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-044 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-045 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-046 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-047 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-048 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-049 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-050 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-051 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-052 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-053 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-054 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-055 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-056 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-057 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-058 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-059 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-062 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-063 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-069 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-071 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-072 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-073 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-074 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-075 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-076 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-077 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-078 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-079 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-087 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-089 | 02-settings | T4-wiring-test | test | high | G1-test G3-deps G4-xprovider | pending |
| T-090 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-096 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-099 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-103 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-104 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-105 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-106 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-107 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-108 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-109 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-112 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-113 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-114 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-115 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-116 | 02-settings | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-117 | 02-settings | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-122 | 02-settings | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-130 | 02-settings | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-134 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-135 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-136 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-137 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-138 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-139 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-140 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-141 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-142 | 02-settings | T0-root | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-001 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-007 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-071 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-076 | 01-npd | docs | plan | high | G1-test G3-deps G4-xprovider | pending |
| T-092 | 01-npd | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-101 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-007 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-064 | 03-technical | docs | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-065 | 03-technical | docs | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-066 | 03-technical | docs | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-069 | 03-technical | docs | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-070 | 03-technical | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-071 | 03-technical | docs | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-081 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-082 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-083 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-084 | 03-technical | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-085 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-086 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-087 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-088 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-089 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-091 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-003 | 04-planning-basic | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 04-planning-basic | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-007 | 04-planning-basic | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-032 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-066 | 04-planning-basic | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-009 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-023 | 05-warehouse | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-035 | 05-warehouse | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-045 | 05-warehouse | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-058 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 06-scanner-p1 | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 06-scanner-p1 | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 06-scanner-p1 | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 06-scanner-p1 | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-005 | 06-scanner-p1 | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-012 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-015 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-016 | 06-scanner-p1 | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-049 | 06-scanner-p1 | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 07-planning-ext | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 07-planning-ext | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 07-planning-ext | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-011 | 07-planning-ext | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-025 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-058 | 07-planning-ext | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-002 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 08-production | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-009 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-012 | 08-production | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-013 | 08-production | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-014 | 08-production | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-015 | 08-production | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-035 | 08-production | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-038 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-039 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-056 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 09-quality | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-012 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-017 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-025 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-031 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-034 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-037 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-042 | 09-quality | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-047 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-048 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-049 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-065 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 10-finance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 10-finance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 12-reporting | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 12-reporting | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 12-reporting | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 13-maintenance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 14-multi-site | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-031 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 15-oee | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 15-oee | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 15-oee | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |

## Wave 2 — full detail (124 tasks)
| Task | Module | Type | Writer | Risk | Gates | Status |
|---|---|---|---|---|---|---|
| T-067 | 00-foundation | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-112 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-114 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-116 | 00-foundation | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-034 | 02-settings | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-061 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-064 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-065 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-066 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-067 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-068 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-070 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-080 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-081 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-088 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-100 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-101 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-102 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-118 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-119 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-123 | 02-settings | T5-seed | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-129 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-144 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-145 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-147 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-150 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-152 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-002 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-030 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-032 | 01-npd | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-036 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-041 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-043 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-049 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-054 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-069 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-070 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-080 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-083 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-093 | 01-npd | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-030 | 03-technical | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-031 | 03-technical | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-078 | 03-technical | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-079 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 04-planning-basic | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 04-planning-basic | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 04-planning-basic | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-041 | 04-planning-basic | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-002 | 05-warehouse | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-013 | 05-warehouse | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-041 | 05-warehouse | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 06-scanner-p1 | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-013 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-014 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-022 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-023 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-024 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-026 | 06-scanner-p1 | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-002 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-007 | 07-planning-ext | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-009 | 07-planning-ext | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 07-planning-ext | T5-seed | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-019 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-020 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-021 | 07-planning-ext | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-024 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-026 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-027 | 07-planning-ext | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-048 | 07-planning-ext | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-007 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-011 | 08-production | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-016 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-019 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-020 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-021 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-027 | 08-production | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-030 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-036 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-037 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-040 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-044 | 08-production | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-045 | 08-production | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-006 | 09-quality | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-008 | 09-quality | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-009 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 09-quality | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-018 | 09-quality | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-021 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-023 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-026 | 09-quality | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-035 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-050 | 09-quality | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-057 | 09-quality | T5-seed | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 10-finance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-009 | 10-finance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-027 | 10-finance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 11-shipping | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 12-reporting | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 12-reporting | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-001 | 13-maintenance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 13-maintenance | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-003 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 14-multi-site | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-012 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-021 | 14-multi-site | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-004 | 15-oee | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 15-oee | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-006 | 15-oee | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 15-oee | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |

## Wave 3 — full detail (114 tasks)
| Task | Module | Type | Writer | Risk | Gates | Status |
|---|---|---|---|---|---|---|
| T-117 | 00-foundation | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-060 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-083 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-085 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-086 | 02-settings | T4-wiring-test | test | high | G1-test G3-deps G4-xprovider | pending |
| T-097 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-098 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-111 | 02-settings | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-126 | 02-settings | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-146 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-149 | 02-settings | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-008 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-009 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-010 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-011 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-012 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-014 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-015 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-016 | 01-npd | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-028 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-029 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-031 | 01-npd | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-037 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-042 | 01-npd | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-048 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-050 | 01-npd | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-055 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-063 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-072 | 01-npd | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-077 | 01-npd | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-081 | 01-npd | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-084 | 01-npd | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-085 | 01-npd | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-090 | 01-npd | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-017 | 03-technical | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-018 | 03-technical | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-019 | 03-technical | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-020 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-021 | 03-technical | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-022 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-028 | 03-technical | T4-wiring-test | test | high | G1-test G3-deps G4-xprovider | pending |
| T-072 | 03-technical | docs | plan | low | G1-test G3-deps G4-selfcheck | pending |
| T-074 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-075 | 03-technical | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-080 | 03-technical | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-009 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-020 | 04-planning-basic | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-027 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-028 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-029 | 04-planning-basic | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-042 | 04-planning-basic | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-003 | 05-warehouse | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 05-warehouse | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-005 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-007 | 05-warehouse | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-014 | 05-warehouse | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-015 | 05-warehouse | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-019 | 05-warehouse | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-020 | 05-warehouse | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-043 | 05-warehouse | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-046 | 05-warehouse | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-007 | 06-scanner-p1 | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-017 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-018 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-048 | 06-scanner-p1 | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-012 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-013 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-016 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-022 | 07-planning-ext | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-028 | 07-planning-ext | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-042 | 07-planning-ext | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-049 | 07-planning-ext | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-053 | 07-planning-ext | T4-wiring-test | test | low | G1-test G3-deps G4-selfcheck | pending |
| T-054 | 07-planning-ext | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-017 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-023 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-028 | 08-production | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-041 | 08-production | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-043 | 08-production | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-046 | 08-production | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-049 | 08-production | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-007 | 09-quality | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-013 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-014 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-019 | 09-quality | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-022 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-027 | 09-quality | T2-api | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-032 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-036 | 09-quality | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-039 | 09-quality | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-004 | 10-finance | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 10-finance | T5-seed | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 10-finance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-015 | 10-finance | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-006 | 11-shipping | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-009 | 12-reporting | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-010 | 12-reporting | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-011 | 12-reporting | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-004 | 13-maintenance | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-029 | 13-maintenance | T5-seed | impl-standard | low | G1-test G3-deps G4-selfcheck | pending |
| T-007 | 14-multi-site | T2-api | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-009 | 14-multi-site | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-013 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-017 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-023 | 14-multi-site | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-027 | 14-multi-site | T1-schema | impl-standard | high | G1-test G3-deps G4-xprovider | pending |
| T-007 | 15-oee | T1-schema | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-008 | 15-oee | T2-api | impl-logic | low | G1-test G3-deps G4-selfcheck | pending |
| T-011 | 15-oee | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-012 | 15-oee | T2-api | impl-logic | high | G1-test G3-deps G4-xprovider | pending |
| T-020 | 15-oee | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |
| T-022 | 15-oee | T3-ui | impl-ui | high | G1-test G3-deps G2-parity G4-xprovider | pending |

## Sanity checks
✅ Every task in exactly one wave. ✅ No task precedes a dependency. ✅ Every T3-ui carries G2-parity. ✅ Every high-risk task carries G4-xprovider.
