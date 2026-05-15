---
name: MON-domain-maintenance
description: "Use when implementing 13-maintenance tasks: PM schedule, MWO, LOTO (dual e-sign T-124), calibration (dual e-sign), sanitation, spare parts. Cross-link to OEE downtime + quality calibration.failed auto-MWO trigger."
version: 1.0.0
model: opus
canonical_spec: docs/prd/13-MAINTENANCE-PRD.md
---

# MON-domain-maintenance — CMMS / PM / LOTO / Calibration Playbook

**Purpose:** implementation guidance for any task in `_meta/atomic-tasks/13-maintenance/` (30 tasks: T-001..T-030) AND any cross-module task that consumes a maintenance contract (calibration sign-off events, MWO downtime linkage, MTBF/MTTR feed to 15-OEE, sanitation allergen-change gate to 08-production). 13-maintenance is the safety-critical layer for OSHA 29 CFR 1910.147 (LOTO), FDA + BRCGS dual-witness calibration, and food-grade sanitation.

**Why this skill exists:** LOTO and calibration e-sign requirements are non-negotiable regulatory contracts; bypassing them = OSHA finding / FDA 483 / BRCGS audit failure. The asset hierarchy (`site → area → line → machine → component`) is canonical; introducing a parallel `assets` table or skipping levels breaks Auditor A slice MNT-001. Re-deriving these per task wastes Opus tokens and reintroduces drift.

## When to use

- Implementing any T-NNN in `_meta/atomic-tasks/13-maintenance/tasks/` (T-001..T-030)
- Implementing an 08-production task that links MWO to `downtime_events` (T-017 auto-MWO consumer)
- Implementing 09-quality work that consumes `calibration.failed` (auto-hold candidate)
- Implementing 15-OEE work that consumes MTBF/MTTR feeds (D-MNT-3)
- Implementing 12-reporting dashboards that consume `mwo.*` outbox events
- Implementing 05-WH spare-parts consumption flows touching `spare_parts_stock`
- Any task whose `cross_module_dependencies` references a 13-maintenance T-NNN

## Do NOT use when

- Pure foundation primitive implementation (T-111..T-125) — use [[MON-foundation-primitives]]
- Schema-only work for a non-maintenance table — use [[MON-t1-schema]] + [[MON-multi-tenant-site]]
- Generic UI parity work with no maintenance domain logic — use [[MON-t3-ui]]

## Required reading (load every time)

1. `_meta/atomic-tasks/13-maintenance/coverage.md` — sub-module map + Auditor A 9 priority slices closure
2. `_meta/atomic-tasks/13-maintenance/manifest.json` — authoritative task list (30 tasks) + cross-module deps + Wave1 primitives used
3. `_meta/atomic-tasks/13-maintenance/BOOTSTRAP-REPORT-2026-05-14.md` — bootstrap red lines + foundation gap closures
4. `_meta/audits/2026-05-14-fixer-F19-maintenance-cleanup.md` — **canonical rules**: T-124 e-sign cross-dep added to 8 tasks (LOTO/calibration), T-112 outbox cross-dep added to 8 tasks, asset hierarchy 5-level chain locked into T-019
5. `docs/prd/13-Maintenance-PRD.md` v3.1 — §4 RBAC, §8.1 (mwo_state_machine_v1 / 3 cron rules), §9.x tables, §11.x validators V-MNT-*, §14.x compliance
6. The target task JSON — `scope_files`, `acceptance_criteria`, `risk_red_lines`, `cross_module_dependencies` are normative

## Sub-modules

Source: `_meta/atomic-tasks/13-maintenance/coverage.md` 2026-05-14.

| Sub-module | Scope | Tasks |
|---|---|---|
| **13-a** Settings + asset registry + RBAC/GDPR/i18n | permission enum (17 `mnt.*.*` strings), equipment table = asset registry per §9.3, technician_profiles, RLS via `app.current_org_id()`, GDPR pseudonymise, i18n `maintenance.*` namespace, asset list+detail UI, technicians UI | T-001, T-002, T-013, T-019, T-026 |
| **13-b** PM schedule + engine + calendar | `maintenance_schedules` + `pm_occurrences`, PM cron engine in `apps/worker`, calendar views | T-003, T-009 (PM portion), T-020 |
| **13-c** MWO core + LOTO + dashboard + analytics + E2E | `maintenance_work_orders` (WR = state='requested' per D-MNT-9), `mwo_loto_checklists`, state machine, downtime linkage, dashboard, list/detail UI, LOTO safety UI, analytics, wiring tests, E2E spine | T-004, T-007, T-008, T-010, T-014, T-017, T-018, T-021, T-022, T-025, T-027 (analytics), T-028, T-029, T-030 |
| **13-d** Spare parts (catalog + stock + transactions + reorder) | `spare_parts_catalog`, `spare_parts_stock` (soft FK to 05-WH), `spare_parts_transactions`, reorder Server Actions, spares UI | T-005, T-011, T-023 |
| **13-e** Calibration + sanitation + outbox + cross-module integration | `calibration_instruments` + `calibration_records` (SHA-256 immutable cert), `sanitation_checklists`, outbox publisher (8 events), settings/analytics UI half | T-006, T-012, T-015, T-016, T-024, T-027 (settings) |

T-009 spans 13-b and 13-d (3 cron engines: PM, calibration expiry, reorder).

## Asset hierarchy (canonical from PRD §9.3 + Fixer F19 Check 21)

**5-level chain — MUST appear in any equipment table, sidebar tree, and filter bar:**

```
site → area → line → machine → component
```

- **`equipment` IS the asset registry** — no separate `assets` table (Auditor A slice MNT-001 + D-MNT-3 + §9.3). Introducing a parallel table is an immediate revert.
- `equipment.parent_line_id` is a soft FK to 08-production `production_lines` (T-002).
- T-019 UI: the sidebar hierarchy tree (280px column) navigates the 5 levels; filter bar filters by all five.
- `asset_hierarchy` ltree column on equipment encodes the path; full ltree expansion is deferred to 14-multi-site (`site_id` lands day-1 per REC-L1).
- Bulk export CSV is required (T-019 AC).

## E-sign (T-124) — DUAL SIGNATURE MANDATORY for

| Action | Primitive | OSHA / FDA / BRCGS basis | Source task |
|---|---|---|---|
| **LOTO apply** (lockout/tagout) | `dualSign` — first applies lockout, second verifies zero-energy state | OSHA 29 CFR 1910.147 two-person verification (V-MNT-08) | T-014 `applyLoto`, T-025 UI |
| **LOTO clear** (release) | `dualSign` distinct session when `maintenance_settings.loto_two_person_strict=true`; warn-only otherwise (V-MNT-09 wording "warn, best practice") | OSHA 29 CFR 1910.147 release verification | T-014 `clearLoto` |
| **Calibration sign-off** | `dualSign` — calibrator + reviewer (FDA + BRCGS dual-witness rule) | 21 CFR Part 11 + BRCGS Issue 10 calibration evidence chain | T-015 `recordCalibration`, T-024 UI |
| **MWO close** (selected types: critical/safety/repair-with-LOTO) | `signEvent` (single — mechanic) | §11.2 sign-off; PRD §14.3 P2 escalates to dual for cert-bearing closes | T-010 close action, T-022 UI |
| **Sanitation allergen-change** | `signEvent` (hygiene_lead) — drives 08-PROD allergen gate dual-sign | D-MNT-14 + BRCGS allergen control | T-016 |

**Primitive:** `@monopilot/e-sign` (foundation T-124) — `signEvent` (single) or `dualSign` (distinct-session paired). Server-side PBKDF2 PIN verify, server-computed `signature_hash`, replay nonce, paired audit (retention=`security`). All e-sign payloads written via outbox attestation fields.

See [[MON-integrations-compliance]] §CFR-21 + [[MON-foundation-primitives]] §e-sign.

## PM engine pattern

Driven by `apps/worker` per-tenant cron loop (foundation T-111 + T-112).

1. **Schedule table** — `maintenance_schedules` (T-003) — one row per (asset, frequency_rule). P1 supports `calendar_days` only; `usage_hours` / `cycle_count` are schema-present but engine-deferred to P2.
2. **Occurrence table** — `pm_occurrences` (T-003) — materialised due-dates per schedule.
3. **Cron tick** — `apps/worker` scheduler (T-009) runs 3 engines per tenant:
   - **PM due** — scans `maintenance_schedules` where `next_due_date <= now()`, creates MWO with `state='requested'`, source='pm', emits `maintenance.pm.due`.
   - **Calibration expiry** — scans `calibration_records.next_due_date <= now() + alert_threshold`, emits `calibration.expiry_alert`, triggers calibration MWO.
   - **Spare reorder** — scans `spare_parts_stock.qty_on_hand < reorder_threshold`, emits `spare.reorder_threshold_breached` (consumer: 05-WH / D365 PO push deferred P2).
4. **MWO create** — every cron-created MWO is a normal MWO row (state='requested', source ∈ {pm, calibration_due, sanitation, reactive}); no parallel work-requests table per D-MNT-9.
5. **Outbox dispatch** — every engine writes outbox row in the same txn (T-112 dispatcher).

## Outbox events

Canonical event-type strings. Prefix: `maintenance.*` for events listed in T-012 + PRD §12.3. **Always copy event_type verbatim from the owning task JSON; do not re-derive.**

| Event | Producer task | Consumers |
|---|---|---|
| `maintenance.pm.due` | T-009 (PM cron) | 12-reporting, 13-c MWO list refresh |
| `maintenance.mwo.created` | T-010 / T-017 / T-009 | 12-reporting, 15-OEE (downtime correlation) |
| `maintenance.mwo.completed` | T-010 (close) | 12-reporting, 15-OEE (MTBF/MTTR feed input), 09-quality (calibration MWO close) |
| `maintenance.loto.applied` | T-014 | 12-reporting LOTO Compliance dashboard, audit |
| `maintenance.loto.released` | T-014 | 12-reporting, audit |
| `maintenance.calibration.completed` | T-015 (result≠FAIL) | 09-quality (lab_results FK), 12-reporting |
| `maintenance.calibration.failed` | T-015 (result='FAIL') | **09-quality (auto-hold candidate, V-MNT-10)**, 12-reporting |
| `maintenance.downtime.recorded` | **CONSUMED from 08-production** (`production.downtime.recorded`) — T-017 links MWO to downtime | producer = 08-production; consumer side here |
| `maintenance.sanitation.allergen_change.completed` | T-016 | 08-production E7 `allergen_changeover_gate_v1` rule consumer |
| `spare.reorder_threshold_breached` | T-009 / T-011 | 05-warehouse (D365 PO push P2) |

All emission via outbox (foundation T-112), never direct queue writes. T-012 owns the publisher + Zod contracts + DLQ + cross-module routing.

## Cross-module deps (consumer + producer)

**13-maintenance as CONSUMER:**
- **09-quality** `calibration.failed` outbox event — P2 auto-MWO trigger (lab-result fail → spawn calibration MWO).
- **08-production** `production.downtime.recorded` — T-017 auto-MWO consumer + MWO ↔ downtime FK linkage; **the 08-PROD downtime_events producer is the canonical event source** (T-017 currently uses a minimal local STUB schema; escalation note in F19 audit).
- **02-settings** `rule_definitions` registry — T-007 mwo_state_machine_v1 + `loto_pre_execution_gate_v1` + `calibration_expiry_alert_v1`; `Reference.ManufacturingOperations` ref table (§8.9 v3.4 delta).
- **05-warehouse** `spare_parts_stock.warehouse_id` soft FK (no FEFO per D-MNT-6).
- **00-foundation** Wave1: T-111/T-112 outbox+worker, T-113/T-114 GDPR, T-116..T-118 observability, T-121 rate-limit (safety bucket 10/min on LOTO), T-122 CI, T-123 Playwright, T-124 e-sign, T-125 `app.current_org_id()`.

**13-maintenance as PRODUCER:**
- **09-quality** consumes `maintenance.calibration.completed` (lab_results FK) + `maintenance.calibration.failed` (auto-hold candidate, V-MNT-10).
- **12-reporting** consumes all `maintenance.mwo.*` + `maintenance.loto.*` + `maintenance.calibration.*` events (dashboards_catalog seeded by T-029 — 6 P1 + 8 P2).
- **15-OEE** consumes `maintenance.mwo.completed` for MTBF/MTTR feed (D-MNT-3). **Maintenance does NOT compute MTBF/MTTR** — it reads `oee_shift_metrics` read-only and displays "Sourced from 15-OEE" banner (T-018 + T-027).
- **08-production** E7 consumes `maintenance.sanitation.allergen_change.completed` via `allergen_changeover_gate_v1` rule (D-MNT-14).

## Spare parts stock

- **Catalog**: `spare_parts_catalog` (T-005) — per-org master.
- **Stock**: `spare_parts_stock` (T-005) — `warehouse_id` is a **soft FK** to 05-warehouse warehouses table. No FEFO logic per D-MNT-6 (parts are durable, not perishable).
- **Transactions**: `spare_parts_transactions` (T-005) — every consume / adjust / receive row.
- **Consume on MWO complete**: T-010 / T-011 server action writes `spare_parts_transactions` (type='consume', mwo_id FK), decrements `spare_parts_stock.qty_on_hand`, emits outbox event for warehouse (`spare.consumed` payload includes mwo_id + qty + sku).
- **Reorder**: T-009 cron scans `qty_on_hand < reorder_threshold`, emits `spare.reorder_threshold_breached`; the D365 PO push is **P2 deferred** (§12.2 + BL-MAINT-07) — P1 only emits the event.
- RBAC: `mnt.spare.consume` / `mnt.spare.adjust` / `mnt.spare.reorder` (T-001).

## Forbidden patterns

1. **Skip dual sign on LOTO or calibration** — REGULATORY VIOLATION (OSHA 29 CFR 1910.147 / 21 CFR Part 11 / BRCGS Issue 10). Always invoke `dualSign` from foundation T-124; never stub, never client-side, never skip second-person check.
2. **Bypass the 5-level equipment hierarchy** (`site → area → line → machine → component`) — Auditor A slice MNT-001 + §9.3. No flattening, no skipping levels in UI tree or filter bar.
3. **Introduce a parallel `assets` table or `work_requests` table** — equipment IS the asset registry (D-MNT-3); WR is `maintenance_work_orders.state='requested'` (D-MNT-9). Both = immediate revert.
4. **Mutate a finalized calibration record** — `calibration_records` with `certificate_sha256 IS NOT NULL` are immutable. Second upload on same recordId → fails `CAL_CERT_IMMUTABLE` (T-015 AC5). BRCGS evidence chain requirement.
5. **Allow MWO close without sign-off when required** — close action checks MWO type / safety classification and demands `signEvent` (or `dualSign` for critical) via T-124; bypass = audit finding.
6. **Compute MTBF/MTTR locally** — 15-OEE `oee_shift_metrics` is the single source (D-MNT-3). Maintenance reads only; analytics tab MUST show "Sourced from 15-OEE" banner.
7. **Direct queue writes** — every event goes through outbox (T-112). No `queue.publish()` from a Server Action.
8. **Raw GUC reads** — `current_setting('app.current_org_id')` is FORBIDDEN; use `app.current_org_id()` function-form. See [[MON-multi-tenant-site]].
9. **Mutate the `retention_until` GENERATED column** on calibration_records / sanitation_checklists / maintenance_history — BRCGS 7y retention is `GENERATED ALWAYS AS STORED`, cannot be set by hand (T-006).
10. **Compute calibration cert SHA-256 client-side** — server-side `crypto.subtle.digest('SHA-256', buffer)` only (21 CFR Part 11 evidence chain).
11. **Bypass T-064 quality holds gate** when MWO touches a held LP — defer to [[MON-domain-quality]] §T-064.

## Cross-links

- [[MON-project-overview]] — repo map, tech stack, module glossary
- [[MON-t1-schema]] — Drizzle schema + migration authoring (T-002..T-006, T-008)
- [[MON-t2-api]] — Server Action authoring (T-009..T-017)
- [[MON-foundation-primitives]] — **T-111 worker + T-124 e-sign critical**; T-112 outbox, T-121 rate-limit, T-116..T-118 observability, T-125 `app.current_org_id()`, T-113/T-114 GDPR
- [[MON-multi-tenant-site]] — `org_id`, `site_id` REC-L1 day-1, `app.current_org_id()`, RLS on every `maintenance_*` / `equipment` / `spare_parts_*` / `calibration_*` table
- [[MON-integrations-compliance]] — CFR-21 Part 11 e-sign chain, BRCGS Issue 10 retention (7y), OSHA 29 CFR 1910.147 LOTO
- [[MON-domain-quality]] — calibration cross-link (`maintenance.calibration.failed` → auto-hold candidate, V-MNT-10); HACCP verification FK stub `equipment_calibration_id`
- [[MON-domain-production]] — `production.downtime.recorded` consumer for auto-MWO (T-017); `allergen_changeover_gate_v1` E7 consumer of sanitation allergen-change event
- [[MON-domain-warehouse]] — `spare_parts_stock.warehouse_id` soft FK; spare consume outbox
- [[MON-domain-oee]] — MTBF/MTTR read-only consumer (D-MNT-3); `oee_maintenance_trigger_v1` P2 stub registered in T-007
