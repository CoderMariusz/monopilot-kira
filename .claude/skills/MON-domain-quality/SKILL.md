---
name: MON-domain-quality
description: "Use when implementing 09-quality module tasks: NCR workflow, HACCP/CCP monitoring + deviations, allergen gates, holds + T-064 consume gate, lab integration, quality specs+spec wizard, calibration cross-link. Required reading whenever touching 09-quality or any production-consume task."
version: 1.0.0
model: opus
canonical_spec: docs/prd/09-Quality-PRD.md
---

# MON-domain-quality — Quality Management System Playbook

**Purpose:** implementation guidance for any task in `_meta/atomic-tasks/09-quality/` (65 tasks: T-001..T-065) AND any cross-module task that consumes a quality contract (consume gates, NCR auto-create, allergen sign-off, calibration refs). 09-quality is the regulatory guardian layer for BRCGS Issue 10 + 21 CFR Part 11 + GS1 traceability.

**Why this skill exists:** quality contracts are cross-cutting and easy to get wrong silently. The `v_active_holds` consume gate (T-064) is cited by 14+ production WO consume tasks; bypassing it = unlogged consumption of held material = BRCGS finding. E-sign requirements (T-124 `signEvent`/`dualSign`) are non-negotiable for NCR close, spec approval, allergen gate. Re-deriving these per task wastes Opus tokens and reintroduces drift.

## When to use

- Implementing any T-NNN in `_meta/atomic-tasks/09-quality/tasks/`
- Implementing an 08-production WO-consume / 05-warehouse LP-consume task — must wire the T-064 gate
- Implementing 01-NPD allergen-cascade work that triggers a quality allergen-gate sign-off
- Implementing 13-maintenance calibration tasks that emit `quality.calibration.*` events
- Implementing 11-shipping LP qa_status gating (read-only from `v_active_holds`)
- Any task whose `cross_module_dependencies` references a 09-quality T-NNN

## Do NOT use when

- Pure foundation primitive implementation (T-111..T-125) — use [[MON-foundation-primitives]]
- T1-schema for a non-quality table that merely has `org_id`+RLS — use [[MON-t1-schema]] + [[MON-multi-tenant-site]]
- Pure i18n / theming UI work — use [[MON-t3-ui]]

## Required reading (load every time)

1. `_meta/atomic-tasks/09-quality/coverage.md` — full sub-module map + prototype label coverage
2. `_meta/atomic-tasks/09-quality/manifest.json` — authoritative task list (65 tasks)
3. `_meta/atomic-tasks/09-quality/UPGRADE-REPORT-2026-05-14.md` — gold-standard completion notes, dependency edges, red-lines lifted from translation notes
4. `_meta/audits/2026-05-14-fixer-F3-prototype-linkage-remediation.md` — prototype anchor + `prototype_index_entry` mapping for the 14 pre-existing T3-ui tasks
5. `docs/prd/09-Quality-PRD.md` §1..§3 — vocabulary + persona matrix + out-of-scope
6. The target task JSON — `scope_files`, `acceptance_criteria`, `risk_red_lines`, `cross_module_dependencies` are normative; do not exceed them

## Sub-modules

Source: `_meta/atomic-tasks/09-quality/coverage.md` 2026-05-14.

| Sub-module | Scope | Task range |
|---|---|---|
| **09-a** Hold/Release + Status + e-sign cross-cut + RBAC | `quality_holds`, `quality_hold_items`, `quality_status_types`, `qa_status_state_machine_v1` rule, hold CRUD/release, e-sign primitive cross-cut, dashboard, holds list/detail/create/release UI | T-001..T-016 |
| **09-b** Specifications & Test Parameters | `quality_specifications`, `quality_spec_parameters`, versioned approval, allergen profile snapshot, spec list/wizard/detail/sign UI | T-017..T-024 |
| **09-c** Incoming Inspection & Test Results | `quality_inspections`, `quality_test_results`, `sampling_plans`, scanner SCN-070..073 handoff, GRN consumer, inspection list/detail/templates/sampling-plans/assign UI | T-025..T-036 |
| **09-d** NCR (Non-Conformance Reports) | `ncr_reports` + dual-sign critical close + auto-create wiring + 6 outbox events + `ncr_root_cause_categories` seed + ncr_list/detail/create_modal/close_modal UI | T-037..T-046 |
| **09-e** HACCP + CCP + Incidents + Complaints + Allergen Gates | `haccp_plans`/`ccps`/`monitoring_records`, `quality_incidents`, `quality_complaints`, `lab_results` ATP extension, `ccp_deviation_escalation_v1` DSL rule, APIs, 12 outbox events, demo seed, haccp_plans/ccp_monitoring/ccp_deviations/allergen_gates UI + E2E | T-047..T-062 |
| **09-cross** Cross-module contract pins | `warehouse.grn.*` event contract (T-063), `v_active_holds` view + `holdsGuard` (T-064), `quality.*` perm-enum reconciliation (T-065) | T-063..T-065 |

## Key concepts glossary

- **NCR** (Non-Conformance Report) — formal record of a quality deviation. Severity ∈ {minor, major, critical}. Critical close requires distinct-session dual-sign (V-QA-NCR-006). 10y retention. Schema: `ncr_reports` (T-037). Server Actions: `createNcrDraft` / `submitNcr` / `assignNcr` / `updateNcr` / `closeNcr` (T-038).
- **CCP** (Critical Control Point) — HACCP-defined point in a process where a hazard MUST be controlled. Stored in `ccps` (T-047). Monitored via `monitoring_records` (T-047). Deviations escalated by DSL rule `ccp_deviation_escalation_v1` (T-052) → auto-create NCR (T-041) + conditional auto-hold.
- **HACCP** (Hazard Analysis & Critical Control Points) — food-safety methodology. `haccp_plans` (T-047) own multiple CCPs; plans go through draft→active lifecycle; activation requires e-sign for biological/allergen hazard types. 5y retention.
- **Allergen gate** — dual-sign barrier protecting `08-production` allergen changeovers. First signer = shift_lead/hygiene_lead; second signer = quality_lead/hygiene_lead (distinct session). Override allowed only when `risk_level='low'`. Audit table: `allergen_gate_overrides` (T-055). Consumer: 08-PROD E7 `allergen_changeover_gate_v1` rule.
- **Hold** — administrative block on an LP, lot, or batch that prevents consumption/shipping. Lifecycle: open → investigating/escalated/quarantined → released (with `released_at` IS NOT NULL). Stored in `quality_holds` (T-004); items in `quality_hold_items`. 7y retention.
- **Consume gate** — runtime check at WO consume / LP consume time that asserts NO active hold covers the reference. Single contract = T-064 `assertNoActiveHoldForWo` / `assertNoActiveHoldForLp` reading `v_active_holds`. Failure mode: `QaHoldActiveError(409)` with envelope `{code:'QA_HOLD_ACTIVE', hold_number, priority, reason_code}`.
- **Lab result** — external/internal test outcome, linked via `lab_results.external_lims_id` (P1 stub, P2 LIMS bridge). ATP extension (T-050) adds `inspection_id`, `allergen_changeover_validation_id`, `pass_threshold`, `pass_flag`.
- **Calibration** — equipment-side concern owned by 13-MAINTENANCE; 09-QA HACCP verification records link via reserved FK stub `equipment_calibration_id`. Calibration outcomes emit `quality.calibration.*` events consumed by maintenance for auto-MWO P2.

## CRITICAL: T-064 consume gate

**What it is:** the canonical read-model contract that lets 08-PROD's WO-consume Server Action and 05-WH's LP-consume Server Action atomically block consumption when an active hold covers the WO or the LP's parent batch.

**Surfaces:**
- `packages/db/migrations/0134_v_active_holds_view.sql` — `CREATE OR REPLACE VIEW v_active_holds AS SELECT id AS hold_id, hold_number, org_id, reference_type, reference_id, priority, hold_status, created_at, estimated_release_at, default_hold_duration_days FROM quality_holds WHERE hold_status IN ('open','investigating','escalated','quarantined') AND released_at IS NULL`. **SECURITY INVOKER** (NEVER DEFINER — would bypass RLS).
- `packages/server/src/quality/holdsGuard.ts` — `assertNoActiveHoldForWo(woId, orgId)` and `assertNoActiveHoldForLp(lpId, orgId)` throwing `QaHoldActiveError(409)`.
- Partial index `idx_holds_active` (from T-004) — assert EXPLAIN usage in schema tests.

**Risk red line every production-consume task MUST declare:**

> "Material consumption MUST pass the T-064 quality hold gate (`v_active_holds` check) before recording consumption. Direct read of `quality_holds` from any consume Server Action is a contract violation — import `assertNoActiveHoldForWo` / `assertNoActiveHoldForLp` from `packages/server/src/quality/holdsGuard` (single source of truth)."

Cross-mod dep entry: `"cross_module_dependencies": ["09-quality:T-064", ...]`.

## v_active_holds view

Read-only consumer interface. Shipping (11-SHIPPING LP qa_status gate), production (08-PROD WO consume), and warehouse (05-WH LP consume) ALL query it via the `holdsGuard` helper. Never bypass — never re-read `quality_holds` directly from a consume path. The contract test in T-064 enforces single-source-of-truth via grep over `apps/*` + `packages/*`.

RLS flows through `SECURITY INVOKER` — caller's `app.current_org_id()` (Wave0 v4.3 function-form, NEVER raw `current_setting('app.current_org_id')`) is the only tenant filter.

## E-sign requirements

Every state transition listed below requires `signEvent` (single) or `dualSign` (distinct-session paired) from [[MON-foundation-primitives]] §e-sign (T-124) wrapped in the shared `<ESignBlock>` Server Component (T-039) — see [[MON-integrations-compliance]] §CFR-21.

| Action | Primitive | Source |
|---|---|---|
| NCR close (critical severity) | `dualSign` (distinct session, SoD) | T-038 V-QA-NCR-005..007 + T-046 |
| NCR close (minor/major) | `signEvent` | T-038 + T-046 |
| Spec approval / spec sign | `signEvent` | T-019, T-024 |
| Sampling plan approval | `signEvent` | T-031, T-035 |
| Inspection sign-off (pass/fail commit) | `signEvent` (auto-NCR on fail per T-041) | T-028, T-033 |
| HACCP plan activate (biological/allergen) | `signEvent` (conditional) | T-051, T-058 |
| CCP deviation sign-off | `signEvent` | T-060 |
| Allergen gate first sign | `signEvent` (shift_lead/hygiene_lead) | T-055, T-061 |
| Allergen gate second sign | `signEvent` distinct session (quality_lead) | T-055, T-061 |
| Hold release | `signEvent` | T-007 |

All e-sign red-lines from `translation-notes-quality.md` are consolidated in T-039 (PBKDF2 PIN server-side, server-computed signature_hash, distinct-session enforcement, immutability after signing). BL-QA-06 (virtual numeric keypad anti-keylogger) is medium-prio follow-up, NOT in P1.

## Holds workflow

| Hold type | Reference | Created by | Released by (RBAC) |
|---|---|---|---|
| **LP-hold** | `reference_type='lp'` + `reference_id=lp_id` | qa_inspector, shift_lead, hygiene_lead, prod_manager, quality_lead | quality_lead, prod_manager (own holds released by hygiene_lead allowed) |
| **lot-hold** | `reference_type='lot'` + lot id | same | same |
| **spec-hold** | `reference_type='spec_violation'` | quality_lead, qa_inspector | quality_lead |
| **allergen-hold** | `reference_type='allergen_cascade'` | hygiene_lead, quality_lead | quality_lead (only, with second sign per allergen gate) |

State machine (driven by `qa_status_state_machine_v1` rule, T-005): `open → investigating → escalated|quarantined → released`. `released_at` IS NOT NULL is the terminal flag consumed by `v_active_holds`. Audit immutable via `prevent_*_update` triggers + `signature_hash` columns. RBAC matrix in PRD §2.3.

## Outbox events emitted

Canonical event-type strings per `_meta/specs/event-naming-convention.md`. Prefix: `qa.*` (PRD line 75 says `qa.*.*`; the gold-standard upgrade uses `quality.*.*` for new 09-d/09-e events — both prefixes appear in the corpus; **always copy the verbatim event_type from the owning task JSON**, do not re-derive).

| Event | Producer task | Consumers |
|---|---|---|
| `quality.ncr.opened` | T-040 | reporting, maintenance auto-MWO P2 |
| `quality.ncr.submitted` | T-040 | reporting |
| `quality.ncr.assigned` | T-040 | reporting |
| `quality.ncr.updated` | T-040 | reporting |
| `quality.ncr.closed` | T-040 | reporting, 05-WH (hold suggestion stub on critical) |
| `quality.ncr.critical_dual_signed` | T-040 | audit |
| `quality.hold.created` | T-011 | 05-WH, 08-PROD, 11-SHIPPING (all consume-gate consumers) |
| `quality.hold.released` | T-011 | 05-WH, 08-PROD, 11-SHIPPING |
| `quality.haccp.plan_activated` / `quality.ccp.monitored` / `quality.ccp.deviated` | T-056 | reporting, 08-PROD (auto-hold on critical) |
| `quality.complaint.opened` / `quality.complaint.escalated_to_ncr` / `quality.complaint.closed` | T-056 | reporting |
| `quality.incident.opened` / `quality.incident.verified` / `quality.incident.escalated` | T-056 | reporting, maintenance |
| `quality.allergen_gate.first_signed` / `quality.allergen_gate.second_signed` / `quality.allergen_gate.override_recorded` | T-056 | 08-PROD E7, audit |
| `quality.calibration.approved` | T-051 / 13-MAINTENANCE | maintenance (auto-MWO P2) |
| `quality.calibration.failed` | T-051 / 13-MAINTENANCE | **maintenance auto-MWO P2 (critical consumer)**, reporting |

All emission via outbox (T-112), never direct queue writes. See [[MON-foundation-primitives]] §outbox.

## Cross-module deps (consumer + producer)

**09-quality as PRODUCER** (other modules consume these):
- **Holds** (`quality_holds` + `v_active_holds`) — consumed by 05-WH LP consume, 08-PROD WO consume, 11-SHIPPING LP qa_status gate
- **NCR events** (`quality.ncr.*`) — consumed by 12-REPORTING dashboards, 13-MAINTENANCE auto-MWO P2
- **Calibration results** (`quality.calibration.{approved,failed}`) — consumed by 13-MAINTENANCE for auto-MWO P2 trigger
- **Allergen gate second-sign** — consumed by 08-PROD E7 `allergen_changeover_gate_v1` rule

**09-quality as CONSUMER** (we read these contracts):
- **LP** from 05-WAREHOUSE (T-005 schema, T-016 LP qa_status writer) — consumed by hold creation
- **WO** from 08-PRODUCTION (T-003 schema) — consumed by hold reference + inspection FK
- **Lab result events** (external LIMS via `lab_results.external_lims_id` P1 stub, P2 bridge)
- **Allergen cascade** from 03-TECHNICAL (`allergen_cascade_rm_to_fg`) + 01-NPD (allergen profile) — consumed by spec snapshot + allergen gate
- **GRN events** (`warehouse.grn.*`) — consumed by T-030 + T-041 auto-NCR on GRN-fail; contract pinned by T-063

**Foundation deps every quality task carries** (see [[MON-foundation-primitives]]): T-111 worker (outbox dispatcher), T-112 outbox, T-124 e-sign, T-125 `withOrgContext`, T-121 rate-limit (on intake actions).

## Forbidden patterns

1. **Bypass holds gate** — never query `quality_holds` directly from a consume path; always `holdsGuard` (T-064). Contract test in T-064 fails on direct reads outside `packages/server/src/quality/`.
2. **Mock e-sign** — never stub `signEvent`/`dualSign` in production code, even behind a feature flag. T-124 is the only path. PIN verify is server-side PBKDF2 only — never client-side.
3. **Skip allergen cascade on raw-material change** — any change to RM allergen profile MUST emit `npd.allergen.*` event → cascade → spec snapshot refresh (T-020). Skipping = batch contamination risk.
4. **Modify finalized NCR** — `closed` NCRs are immutable. Enforced via `prevent_ncr_closed_update` trigger (T-038). Never `UPDATE ncr_reports SET ... WHERE status='closed'`.
5. **Raw GUC reads** — `current_setting('app.current_org_id')` is FORBIDDEN; use `app.current_org_id()` function-form (Wave0 v4.3 lock). See [[MON-multi-tenant-site]].
6. **Duplicate guard logic** — never re-implement `assertNoActiveHoldForWo`/`Lp` in another module. Single source = `packages/server/src/quality/holdsGuard.ts`.
7. **Direct INSERT to `ncr_reports`** — all 3 auto-create paths (GRN-fail, inspection-fail-on-sign, CCP-deviation) route through `createNcrDraft` Server Action (T-038 + T-041). Single audit + outbox path.
8. **Single-session dual-sign** — `dualSign` MUST enforce distinct sessions (different `session_token`); same-user-same-session = SoD violation.
9. **SECURITY DEFINER on `v_active_holds`** — RLS would be bypassed; SECURITY INVOKER only (T-064 red line).
10. **Inventing prototype labels** — only the 32 labels in `_meta/prototype-labels/prototype-index-quality.json` are valid `prototype_index_entry` values. See F3 audit for the 14 pre-existing mappings.

## Recurring live-bugs (pass vitest+tsc, break live — full checklist: `docs/workflow/02-QUALITY-GATES.md` §Recurring live-bug checklist)

Before any 09-quality sign-off, run the canonical Gate-5 checklist (classes 1-12). Quality-specific traps:
1. **RBAC seed (class 1, #1 live bug).** Ship a wave-1 P0 `NNN-quality-permission-seed.sql` granting `quality.*` to the org-admin family (`org.access.admin`/`org.platform.admin`/`owner`/`admin`/`org_admin`) AND QA/lab roles, in BOTH `role_permissions` + legacy jsonb, with org-insert trigger + backfill. Page-CHECK strings must byte-match seed-GRANT strings. Model on `packages/db/migrations/149-npd-permissions-org-admin-seed.sql`.
2. **`'use server'` export rule (class 2).** `holdsGuard` and e-sign helpers: keep shared error classes/consts in a non-`'use server'` sibling — a `'use server'` module may only export async functions or `next build` breaks (tsc/vitest miss it).
3. **Outbox enum (class 5).** Every `quality.ncr.*`/`quality.calibration.*`/`quality.hold.*` event MUST be in `packages/outbox/src/events.enum.ts` + CHECK before emit; all auto-NCR/hold paths route through the single Server Action (Forbidden #1/#7).
4. **Schema task names its consumer (class 10).** A `quality_holds`/`ncr_reports`/`haccp_*` migration is not "done" until its consuming Server Action + UI ship; `v_active_holds` stays SECURITY INVOKER (Forbidden #9).
5. **i18n 4-locale parity (class 6) + regenerate `__expected__/schema.sql`; 3-digit migration ≥ HEAD; never edit an applied migration (class 4).**

## Cross-links

- [[MON-project-overview]] — repo map, tech stack, module glossary
- [[MON-t1-schema]] — Drizzle schema + migration authoring (T-004, T-017, T-025, T-037, T-047..T-050)
- [[MON-t2-api]] — Server Action authoring (T-006..T-010, T-018..T-020, T-026..T-029, T-038..T-039, T-051..T-055)
- [[MON-t3-ui]] — UI parity + `prototype_match` (T-012..T-016, T-021..T-024, T-032..T-036, T-043..T-046, T-058..T-061)
- [[MON-foundation-primitives]] — T-111 worker, T-112 outbox, T-124 e-sign, T-125 `withOrgContext`, T-121 rate-limit
- [[MON-multi-tenant-site]] — `org_id`, `app.current_org_id()`, RLS on `quality_*` tables, SECURITY INVOKER discipline
- [[MON-integrations-compliance]] — CFR-21 Part 11 e-sign, BRCGS Issue 10 retention, GS1 traceability
- [[MON-domain-08-production]] — T-064 consume gate consumer; allergen changeover gate E7 consumer of quality dual-sign
- [[MON-domain-11-shipping]] — `v_active_holds` consumer for LP qa_status gating at pick/pack/BOL
- [[MON-domain-13-maintenance]] — `quality.calibration.*` event consumer (auto-MWO P2); HACCP verification FK stub `equipment_calibration_id`
