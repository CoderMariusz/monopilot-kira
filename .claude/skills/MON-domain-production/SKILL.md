---
name: MON-domain-production
description: "Use when implementing 08-production tasks: WO lifecycle, wo_outputs (canonical owner — NOT 04-planning-basic), wo_waste_log, downtime_events, oee_snapshots producer (D-OEE-1). Consumes T-064 quality consume gate. Critical: cost-per-kg producer."
version: 1.0.0
model: opus
canonical_spec: _meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md
---

# MON Domain — 08-Production (WO execution, canonical `wo_outputs`, OEE producer)

**Read FIRST:** [[MON-project-overview]] (repo map, tech stack, glossary). Then this skill. Then the per-area MON-* skill ([[MON-t1-schema]], [[MON-t2-api]], etc.) for the specific surface you are implementing.

08-production is the **runtime execution module**: WO start/pause/resume/complete/close, material consumption from LPs, output registration (canonical `wo_outputs`), waste, downtime, allergen changeover, OEE snapshot production. It is a **consumer** of 04-planning (WO source), 03-technical (BOM/items), 05-warehouse (LPs), 09-quality (consume gate, NCR/yield); and a **producer** of `wo_outputs` (→ 10-finance cost-per-kg, 12-reporting) and `oee_snapshots` (→ 15-OEE consumer).

## CRITICAL ownership rules

These are user-locked decisions (2026-05-14). Violating them = immediate revert.

- **`wo_outputs` CANONICAL = 08-production T-003.** 04-planning-basic does **NOT** own this table. 04 owns the upstream planning projection `schedule_outputs` (T-005) with columns `planned_wo_id, output_role, expected_qty, allocation_pct, disposition, downstream_wo_id`. On `wo.start`, 08-production runtime reads each `schedule_outputs` row for the WO and projects it into a `wo_outputs` row, populating production-only columns (`batch_number`, `qa_status`, V-PROD-24 unique-per-org-per-year, `catch_weight_details`, allergen cascade hooks, R13 audit). `output_type` enum is 1:1 between `schedule_outputs.output_role` and `wo_outputs.output_type` (`primary` | `co_product` | `by_product`). **Never duplicate the `wo_outputs` table in 04 or anywhere else.** See `_meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md` §A.
- **`oee_snapshots` PRIMARY producer = 08-production** (D-OEE-1 decision). 15-OEE is a **read-only consumer** that builds materialized views and drilldowns on top. **Never let 15-OEE write to `oee_snapshots`.** See [[MON-domain-oee]].
- **D365 is delivery side-effect only.** D365 SO/Built/sync/push never unlocks factory use and never replaces the canonical release read-model. See `_foundation/contracts/d365-posture.md`.
- **WO release is consumed, not owned.** 08 reads the canonical factory release read-model from 01-NPD T-097 + 04-planning T-001 snapshot (`active_bom_header_id`, `active_factory_spec_id`). 08 never owns release enums or selects newer BOM/spec at START.
- **`release_wo_modal` is deprecated** — do not implement in 08. Release/readying UI belongs to Planning.

## Sub-modules (PRD §7 Epic structure)

Source: `_meta/atomic-tasks/08-production/coverage.md`, 56 tasks total.

| Epic | Area | Tasks |
|---|---|---|
| **E1 — Execution Core** | Factory release runtime preflight; WO start/pause/resume/complete/cancel/detail APIs; optimistic locking | T-001, T-016..T-022 |
| **E2 — Consumption + Genealogy** | scanner consume-to-WO, over-consumption approval, genealogy writes, FEFO check, material status | T-023..T-027 |
| **E3 — Output + Waste** | primary/co/by-product output, waste record, genealogy on output, catch-weight, PDF labels, yield gate | T-028..T-034 |
| **E4 — Downtime + Shifts** | downtime taxonomy, manual events, analytics, shift attribution, handovers, sign-off gates | T-035..T-040 |
| **E5 — Integrations (D365)** | D365 JournalLines anti-corruption adapter, dispatcher, DLQ list/replay/resolve | T-041, T-042, T-051 |
| **E6 — Dashboard + OEE** | OEE snapshots producer, line event stream, line-detail aggregation, production settings | T-044, T-045, T-046, T-049, T-050 |
| **E7 — Allergen Gate** | allergen changeover endpoints, ATP evidence, dual sign-off (PIN), `segregation_required` hard-block | T-043, T-048 |
| **Schema / DSL / KPI** | `wo_outputs` canonical (T-003), consumption/waste/downtime/changeover/OEE/outbox/DLQ schemas, operator KPI monthly MV, DSL rules | T-002..T-015, T-056 perm-enum |
| **UI parity** | Dashboard, WO detail, Consumption/Output/Genealogy/History, Allergen, Waste/Downtime/OEE, Shifts/Analytics/Settings/LineDetail, D365 DLQ admin | T-046..T-051 |
| **E2E evidence** | Happy path; scanner contract; exception gates; operations closeout | T-052..T-055 |

## Key concepts

**WO lifecycle states** (append-only via `wo_events` outbox):
`planned` → `in_progress` (start) → `paused` (pause, resumable) → `in_progress` (resume) → `completed` (output gate green) → `closed` (D365 enqueue side-effect, financial close).
Cancel is a terminal branch from any non-closed state; `closed` is terminal. Transitions enforced by `wo_state_machine_v1` DSL rule (Settings T-012 in 08 corpus).

**`wo_outputs` (canonical, T-003)** — production-shape:
`id, org_id, wo_id, output_type ('primary'|'co_product'|'by_product'), product_id, batch_number, qty_kg, uom, lp_id, qa_status, catch_weight_details JSONB, allergen_profile_snapshot, R13 audit cols`. **V-PROD-24:** `(org_id, batch_number, EXTRACT(YEAR FROM created_at))` unique — batch number unique per tenant per year. RLS via `app.current_org_id()`. CHECK `qty_kg >= 0`.

**`wo_waste_log`** — categorized waste (taxonomy in 02-Settings ref-table): `wo_id, category_code, qty_kg, reason_code, recorded_by, scan_event_id`. Feeds yield gate (`output_yield_gate_v1`) + finance loss accounting + reporting analytics.

**`downtime_events`** — categorized + maintenance link: `wo_id, line_id, category_code (planned/unplanned/changeover), reason_code, start_at, end_at, mwo_id NULL (link to 13-maintenance), shift_id, attribution`. Feeds OEE Availability + Quality root-cause + maintenance MWO trigger.

**Allergen changeover (E7, T-043 / T-048)** — pre-START gate. When inbound WO `allergen_profile_snapshot` differs from line's last produced `allergen_profile`, `segregation_required = true` and START is **hard-blocked** until: (1) cleaning protocol recorded, (2) ATP swab evidence attached, (3) dual e-sign (operator + supervisor, PIN via T-124, server-side hash). PIN never in DOM. Hard-block is **unbypassable** (no override surface).

## Quality consume gate (T-064) — MANDATORY

**Per Fixer F5 §B**, 14 production consume tasks have 09-quality T-064 as `cross_module_dependency` + risk red-line + AC:

T-001, T-002, T-011, T-014, T-019, T-021, T-023, T-024, T-025, T-026, T-027, T-031, T-034, T-052.

**Pattern (server-side, every consume / output / completion path):**

```ts
// BEFORE mutating wo_material_consumption / wo_outputs / completion gate:
const hold = await holdsGuard(db, { orgId, lpId, lotId });
if (hold) {
  await emitOutbox('production.consume.blocked', { woId, lpId, lotId, holdId: hold.id });
  throw new ConflictError(409, 'quality_hold_active');
}
// proceed with consumption / output / completion mutation
```

`holdsGuard` queries `v_active_holds` (09-quality T-064 view) for any active hold matching `(org_id, lp_id)` or `(org_id, lot_id)`. If any match → block + outbox event. Never bypass. PRD ref §16.4 V-PROD-02, V-PROD-16.

See [[MON-domain-quality]] for the producer side (hold create/release lifecycle).

## Outbox events emitted (`wo.*` / `production.*` prefix)

All emitted via foundation outbox (T-112), never direct queue writes.

| Event | When | Consumers |
|---|---|---|
| `production.wo.started` | START succeeds (release+gate green) | 04-planning, 12-reporting, 15-OEE |
| `production.wo.completed` | output yield gate green + complete API | 10-finance (variance trigger), 12-reporting |
| `production.wo.closed` | financial close, terminal state | 10-finance (cost-per-kg actual), 12-reporting, 14-multi-site |
| `production.output.recorded` | `wo_outputs` row inserted | 05-warehouse (LP create), 10-finance, 12-reporting |
| `production.waste.recorded` | `wo_waste_log` row inserted | 10-finance (loss), 12-reporting |
| `production.downtime.recorded` | `downtime_events` row closed | 13-maintenance (MWO trigger), 15-OEE |
| `production.consume.completed` | consumption committed | 05-warehouse (LP transitions: available → consumed), 10-finance (actual cost) |
| `production.consume.blocked` | T-064 gate blocks consume | 09-quality (audit), 12-reporting |
| `production.changeover.signed` | allergen gate dual-sign complete | 09-quality, 12-reporting |
| `production.oee.snapshot` | E6 snapshot producer rolls window | 15-OEE (consumer MVs) |

## Consumed events

| Event | Producer | Effect in 08 |
|---|---|---|
| `quality.hold.created` | 09-quality | refresh `v_active_holds`; in-flight consume calls fail next gate check |
| `quality.hold.released` | 09-quality | unblock subsequent consume attempts (no retro-mutation) |
| `warehouse.lp.received` | 05-warehouse | operator can pick LP for consume (FEFO suggest in T-026) |
| `warehouse.lp.transitioned` | 05-warehouse | LP status visible in WO material-status (T-027) |
| `quality.calibration.failed` | 09-quality / 13-maintenance | block equipment for WO start; surface in dashboard |
| `planning.wo.released` | 04-planning | WO becomes startable (factory release read-model approved) |
| `planning.schedule_output.created` | 04-planning T-005 | source row for materialization at WO start |
| `tech.bom.activated` | 03-technical T-080/T-081 | snapshotted into WO at planning time (not re-read at START) |
| `npd.fg.released` | 01-NPD T-097 | canonical factory release admission |

## Cross-module deps

**08-production CONSUMES (08 is the consumer):**
- **04-planning-basic** — `T-001` (WO snapshot with active BOM/spec IDs), `T-005` (`schedule_outputs` projection source). [[MON-domain-planning]]
- **05-warehouse** — LP availability/status, putaway, adjustment, consume transitions. [[MON-domain-warehouse]]
- **09-quality** — **T-064 consume gate (MANDATORY)**, NCR yield-loss, ATP/spec sign-off seam. [[MON-domain-quality]]
- **03-technical** — `T-080`/`T-081` active factory spec + BOM approval, allergen profile, factory-use adapters. BOM SSOT: `_foundation/contracts/shared-bom-ssot.md`.
- **01-NPD** — `T-097` canonical factory release read-model.
- **02-Settings** — rule registry (`wo_state_machine_v1`, `closed_production_strict_v1`, `output_yield_gate_v1`, `allergen_changeover_gate_v1`), production lines/machines/operators ref-tables, D365 capability registry, downtime/waste taxonomies (T-020/T-122/T-126/T-127).
- **06-scanner-p1** — execute/consume/output/waste scanner endpoint contracts + signed deep-link handoff. [[MON-domain-scanner]]
- **07-planning-ext** — external `changeover_matrix` contract.

**08-production PRODUCES (downstream readers):**
- **10-finance** — reads canonical `wo_outputs` for actual cost-per-kg, FIFO/WAC variance (10 T-015/T-017/T-018/T-024). [[MON-domain-finance]]
- **12-reporting** — reads `wo_outputs + wo_consumptions` as fact rows (12 T-002/T-003/T-027). [[MON-domain-reporting]]
- **15-OEE** — consumes `oee_snapshots` rows; builds MVs and drilldowns on top. [[MON-domain-oee]]
- **13-maintenance** — consumes `production.downtime.recorded` to trigger reactive MWOs. [[MON-domain-maintenance]]
- **14-multi-site** — site-scoped via `site_id` column (REC-L1 lock); inter-site WO visible after `production.wo.closed`.

## E-sign requirements (CFR-21 Part 11 via foundation T-124)

Production surfaces requiring `@monopilot/e-sign` digital signatures (PIN + server hash, BRCGS Issue 10, 7-year retention):

- **Allergen changeover sign-off** (T-043/T-048) — dual sign (operator + supervisor), photo + ATP evidence step blocks until both sign.
- **WO close** (T-019/T-022) — supervisor sign on `closed_production_strict_v1` gate.
- **Shift sign-off** (T-040) — handover sign.
- **Override paths** (over-consumption approval T-024, FEFO deviation T-026, yield gate soft-flag override T-034) — supervisor sign with reason code.
- **NCR closure path** (cross-module to 09-Q) — references T-064 hold-release flow.

See [[MON-foundation-primitives]] § e-sign for the `signEvent` API contract.

## Forbidden patterns

Violation = immediate revert / red-line in review.

- **DO NOT** let 15-OEE write to `oee_snapshots`. 08 is the sole producer (D-OEE-1).
- **DO NOT** create a duplicate `wo_outputs` table in 04-planning-basic (or anywhere else). 08-production T-003 is the canonical and sole owner. 04 uses `schedule_outputs` only.
- **DO NOT** bypass the 09-quality T-064 consume gate. Every consume / output / completion path must call `holdsGuard(lpId, lotId)` first. Active hold → 409 + `production.consume.blocked` outbox event.
- **DO NOT** skip allergen changeover dual-sign. `segregation_required = true` is unbypassable; no override surface in UI or API.
- **DO NOT** treat D365 SO/Built/sync/push as factory-use admission. D365 is outbox side-effect only; it never mutates `wo_executions`, release state, `active_bom_header_id`, or `active_factory_spec_id`.
- **DO NOT** auto-select newer BOM/spec at START. WO snapshot (`active_bom_header_id`, `active_factory_spec_id`) is locked from 04-planning T-001 at planning time; 08 runtime never re-reads `current` BOM/spec.
- **DO NOT** implement `release_wo_modal` in 08 — it is deprecated. Release UI lives in 04-planning.
- **DO NOT** make synchronous inline D365 calls from runtime APIs. D365 dispatch is async outbox + DLQ only (T-041/T-042).
- **DO NOT** write status transitions directly to `wo_executions` — append `wo_events` then materialize state via the state machine (T-012).
- **DO NOT** delete DLQ rows (T-051) — resolve/replay only; auditable.
- **DO NOT** display raw D365 credentials or surface PINs in DOM (T-048/T-051).

## Validator + parity expectations

- `python3 _meta/atomic-tasks/08-production/_validate.py` must PASS (56 tasks, ≤4 AC each, kira_dev pipeline, RED→GREEN→REVIEW→CLOSEOUT checkpoints, T3-ui parity-anchor required).
- T3-ui tasks (T-046..T-051) require `prototype_match: true`, literal `prototypes/design/Monopilot Design System/production/*.jsx:line-range` anchor in prompt header, `prototype_index_entry` from `_meta/prototype-labels/prototype-index-production.json`, `ui_evidence_policy` reference, `frontend-design` skill, screenshots + Playwright traces in closeout. See [[MON-t3-ui]].
- T4-e2e closeouts (T-052..T-055) require `ui_evidence_policy` attached.

## Cross-links

- [[MON-project-overview]] — repo map, tech stack, module glossary (read first)
- [[MON-t1-schema]] — Drizzle schema + migration authoring (use for T-002..T-010, T-056)
- [[MON-t2-api]] — Server Actions / API authoring (use for T-001, T-016..T-045)
- [[MON-foundation-primitives]] — outbox, worker, rate-limit, e-sign (T-124), GDPR, observability
- [[MON-multi-tenant-site]] — `org_id`, `site_id`, `app.current_org_id()`, `withOrgContext` / `withSiteContext` HOFs
- [[MON-integrations-compliance]] — D365 export-only anti-corruption, BRCGS, CFR-21, GS1/SSCC
- [[MON-domain-quality]] — **T-064 consume gate (critical)**, holds lifecycle, NCR producer
- [[MON-domain-warehouse]] — LP states, GRN, consume transitions
- [[MON-domain-planning]] — WO source (T-001), `schedule_outputs` (T-005) projection upstream
- [[MON-domain-oee]] — `oee_snapshots` consumer; read-only MVs and drilldowns
- [[MON-domain-finance]] — actual cost-per-kg / FIFO/WAC variance consumer of `wo_outputs`
- [[MON-domain-maintenance]] — `production.downtime.recorded` consumer; equipment + LOTO + calibration
