# Fixer F9 — 01-NPD T-099 / T-100 STUB rebuild

Date: 2026-05-14
Fixer: F9
Scope: rewrite `_meta/atomic-tasks/01-npd/tasks/T-099.json` and `T-100.json` from STUB (priority 30, labels +stub/+deferred/+needs-prd-anchor) to gold-standard atomic tasks.

## Chosen intent + rationale

### T-099 — Allergens cascade bulk-rebuild worker (PRD §8.5)

**Intent**: Background worker that rebuilds `fa.allergens` / `fa.may_contain` across every affected FA when `Reference.Allergens_by_RM` or `Reference.Allergens_added_by_Process` change in bulk (supplier-spec mass upload, regulatory update, lab-result CSV).

**Rationale**: The 2026-05-14 PRD-vs-tasks coverage-gap audit (`2026-05-14-prd-vs-tasks-coverage-gaps.md` §01-NPD) explicitly flags this gap:
> Allergens cascade rebuild on bulk import — none — implicit (T-009..T-017 cover schema, not cron rebuild)

T-009..T-017 cover the per-FA cascade triggered by FA-side changes; the inverse trigger (reference-table mass change → every existing FA stale) is uncovered. Without this worker, a single supplier-spec batch update would leave hundreds of FAs with stale `fa.allergens` until each is manually edited — a regulatory exposure (EU FIC 1169/2011 §8.8). This task fills that exact gap using foundation primitives T-111 (worker), T-112 (outbox dispatcher), T-121 (rate-limit), T-040 (R13 audit) and respects the override-preservation rule of §8.6 / §8.10.

**PRD anchors**: `§8.5` (Cascade rule JSON), `§8.2` (Reference.Allergens table), `§8.7` (Refresh allergens UI button).

### T-100 — Stage-Gate G4 Launched closeout + LEGACY successor mapping (PRD §17.11.6)

**Intent**: On G4→Launched gate advancement, write one `npd_legacy_closeout` row binding each legacy R&D stage (Trial/Pilot/Handoff/Packaging) to its canonical successor anchor per the §17.11.6 migration map, and render a 4-sub-indicator pill on the Launched-column kanban card.

**Rationale**: `coverage.md` Notes section explicitly says:
> §17.11.6 LEGACY (Trial/Pilot/Handoff/Packaging) is not deprecated. These stages return as part of NPD and must be represented in Stage-Gate flow coverage.

No existing task creates these binding rows. The original T-099 stub title was literally "Trial/Pilot/Handoff/Packaging evidence model and gate integration" — that intent is preserved in T-100 and tied to the canonical PRD §17.11.6 LEGACY notes table (Trial→FA Technical, Pilot→first Production WO, Handoff→G4 e-sign + initial BOM SSOT, Packaging→Brief C14-C19 frozen snapshot + MRP complete). This makes the BL-E2E spine extension reachable: T-098 covers Brief→factory release E2E, T-100 now covers the Launched closeout that proves all four legacy successors landed.

**PRD anchors**: `§17.11.6` (LEGACY notes migration map), `§17.6` (Gate advancement flow), `§17.12` (Pipeline View Modes / Launched column).

## Why NOT the alternative candidates

- **Compliance Documents expiry refresh (§19)**: already covered by T-083..T-088 wiring (T-085 SECURITY DEFINER cron, T-088 wiring-test).
- **NPD KPI daily-roll-up worker (§11.7)**: T-090 + T-091 already cover the cache refresh + E2E.
- **Stage-Gate G4 dedicated handoff task**: would overlap T-062 (Stage-Gate E2E) and T-097/T-098 (factory release read model + E2E). The G4→Launched **closeout** layer chosen for T-100 is upstream of those and uncovered.

## Cross-module deps newly declared

T-099:
- `00-FOUNDATION:T-111` apps/worker scaffold + job registry
- `00-FOUNDATION:T-112` outbox dispatcher
- `00-FOUNDATION:T-121` rate-limit primitive
- `00-FOUNDATION:T-040` R13 audit_events table
- `02-SETTINGS` reference-tables CRUD endpoints (emit bulk_changed)

T-100:
- `00-FOUNDATION:T-124` e-sign primitive (handoff anchor)
- `00-FOUNDATION:T-040` R13 audit_events
- `08-PRODUCTION` WO entity (Pilot WO soft FK, no hard reference required)

## Before/after summary

| Field | Before (STUB) | After (T-099) | After (T-100) |
|---|---|---|---|
| priority | 30 | 70 | 70 |
| labels include `stub`/`deferred`/`needs-prd-anchor` | yes | no | no |
| `prd_refs` | wave0-carry-forward placeholder | §8.5, §8.2, §8.7 | §17.11.6, §17.6, §17.12 |
| `scope_files` | "to be enumerated on re-author" | 6 concrete create/modify paths | 6 concrete create paths |
| `acceptance_criteria` | 4 generic re-author placeholders | 4 Given/When/Then concrete | 4 Given/When/Then concrete (incl. prototype line range AC) |
| `test_strategy` | "RED on re-author" | 2 RED test files + pnpm command | 2 RED test files + Playwright UI evidence + pnpm command |
| `risk_red_lines` | 4 generic | 5 concrete | 5 concrete |
| `dependencies` | T-054/T-055/T-056 (stub guess) | T-011/T-012/T-013 (per-FA cascade engine) | T-058/T-093/T-095/T-096/T-097/T-098 (G4 advance + BOM SSOT + release E2E) |
| `cross_module_dependencies` | none | 5 entries | 3 entries |
| `parent_feature` | "01-NPD wave0 carry-forward" | "01-NPD-c Allergens cascade" | "01-NPD-f Stage-Gate Pipeline" |
| `prototype_match` | absent | absent (no UI in T-099) | true + entry `stage_gate_pipeline_kanban` |

## Validator outcome

`python3 _meta/atomic-tasks/01-npd/_validate.py`:

```
FAIL (1 issues across 101 task files):
  - [coverage.md:113] unresolved GAP row: | §2.2, §17.9, §18, §19 (RBAC enum delta — closes _meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md GAP) | tasks/T-101.json | 01-NPD RBAC enum addition | T1-schema | added | 17 `npd.* / brief.create` strings appended to packages/rbac/src/permissions.enum.ts + ALL_<MODULE>_PERMISSIONS export |
```

Both T-099 and T-100 pass all validator checks. The single remaining FAIL is a **pre-existing** coverage.md issue introduced 2026-05-14 by the T-101 RBAC-enum-addition row (which legitimately references the audit GAP terminology) — it predates this fix and is out of F9 scope.

## Coverage.md update

Appended a new section `## STUB rebuilds 2026-05-14` with rows for T-099 and T-100 binding each to its PRD § and sub-module.

## Constraints honored

- NPD red lines: FG canonical (not FA), D365 export-only soft FK, shared BOM SSOT, post-release new version + Technical approval — all enforced in `risk_red_lines` of both tasks.
- Foundation primitives: `app.current_org_id()` for RLS; outbox via T-112; worker via T-111; e-sign via T-124; rate-limit via T-121 — all wired into `cross_module_dependencies` + risk red lines.
- Manifest task count unchanged at 101 (T-099 and T-100 rewritten in place).
- No other tasks modified.
