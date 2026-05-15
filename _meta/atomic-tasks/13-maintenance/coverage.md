# 13-Maintenance Atomic Task Coverage

PRD: `docs/prd/13-MAINTENANCE-PRD.md` (v3.1 — Manufacturing Operations + UI surface catalog amendment)
Audit input: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §13-MAINTENANCE 9 priority slices
Generated: 2026-05-14
Total atomic tasks: 30 (T-001..T-030)

## Sub-module map

| Sub-module | Scope | Tasks |
|---|---|---|
| **13-a** | Settings + permission enum + equipment/asset registry + technician_profiles + RLS + i18n + GDPR | T-001, T-002, T-013, T-019, T-026 |
| **13-b** | maintenance_schedules + PM engine + calendar views | T-003, T-009 (PM portion), T-020 |
| **13-c** | MWO core lifecycle (state machine, checklists, LOTO, downtime linkage, dashboard, MWO list+detail, analytics, e2e) | T-004, T-007, T-008, T-010, T-014, T-017, T-018, T-021, T-022, T-025, T-027 (analytics half), T-028, T-029, T-030 |
| **13-d** | Spare parts (catalog + stock + transactions + reorder + UI) | T-005, T-011, T-023 |
| **13-e** | Calibration + sanitation + outbox publisher + cross-module integration | T-006, T-012, T-015, T-016, T-024, T-027 (settings half) |

## Auditor A priority slices → atomic task mapping

| Auditor slice (MNT-001..009) | Status | Atomic task(s) |
|---|---|---|
| **MNT-001** `assets`/`asset_types`/criticality/RLS | covered | T-002 (equipment table — IS the asset table per §9.3) + T-019 (asset registry UI) |
| **MNT-002** `work_requests` + `mwos` schema | covered (D-MNT-9 unified) | T-004 (single mwo table state='requested' = WR per D-MNT-9) + T-010 state actions + T-021 WR+MWO UI + T-022 MWO Detail |
| **MNT-003** `pm_schedules` + `pm_occurrences` | covered | T-003 schema + T-009 PM cron engine + T-020 UI |
| **MNT-004** `calibration_records` + cert upload | covered | T-006 schema + T-015 actions + T-024 UI |
| **MNT-005** `spares` + reorder thresholds | covered | T-005 schema + T-011 actions + T-023 UI |
| **MNT-006** LOTO (lock-out-tag-out) flow with dual sign-off | covered | T-004 mwo_loto_checklists table + T-014 actions (e-sign via Wave1 T-124) + T-025 UI |
| **MNT-007** MTBF/MTTR producer for 15-OEE oee_shift_metrics | covered as consumer (D-MNT-3) | T-008 MV + T-027 analytics consumer; producer side is 15-OEE-owned |
| **MNT-008** `maintenance_dashboard` + asset list + mwo detail UI parity | covered | T-018 dashboard + T-019 asset + T-021 list + T-022 detail (+ all UI tasks T-020/T-023/T-024/T-025/T-026/T-027) |
| **MNT-009** Permissions enum delta | covered (P0 priority 90) | T-001 (17 strings) |

## P0 blocker

| Task | Priority | Description |
|---|---|---|
| **T-001** | 90 (`p0-blocker`) | Permission enum lock: 17 mnt.*.* strings added to packages/rbac/src/permissions.enum.ts per PRD §4 and Auditor A cross-cutting gap #4 |

## Coverage rows

| PRD ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §4 personas + §14.2 RLS write scopes | tasks/T-001.json | 13-a | T1-schema (p0-blocker) | covered |
| §9.1, §9.2, §9.3, §6.3, §14.2 | tasks/T-002.json | 13-a | T1-schema | covered |
| §9.4, §8.1, §11.7 | tasks/T-003.json | 13-b | T1-schema | covered |
| §9.5, §9.6, §9.7, §8.2, §11.1, §14.2 | tasks/T-004.json | 13-c | T1-schema | covered |
| §9.8, §9.9, §9.10, §9.11, §7.1 D-MNT-6, §11.5 | tasks/T-005.json | 13-d | T1-schema | covered |
| §9.12, §9.13, §9.14, §9.15, §5, §14.1 | tasks/T-006.json | 13-e | T1-schema | covered |
| §8.1, §8.2 (mwo_state_machine_v1 YAML) | tasks/T-007.json | 13-a | T5-seed (rules) | covered |
| §9.16, §10.1, §3.3 | tasks/T-008.json | 13-c | T1-schema (MV + cron) | covered |
| §8.1 (3 cron rules), §9.4, §9.13, §9.9, §11.6 | tasks/T-009.json | 13-b/13-d | T2-api (worker) | covered |
| §8.2, §11.1, §11.2, §11.4, §11.6 | tasks/T-010.json | 13-c | T2-api (server actions) | covered |
| §11.5, §9.10, §9.11 | tasks/T-011.json | 13-d | T2-api (server actions) | covered |
| §12.3, D-MNT-12, D-MNT-14 | tasks/T-012.json | 13-e | T2-api (outbox) | covered |
| §13.2, §14.4, §14.5 | tasks/T-013.json | 13-a | T5-seed (gdpr+i18n) | covered |
| §7.2 D-MNT-15, §8.1, §11.2, §9.7 | tasks/T-014.json | 13-c | T2-api (LOTO actions) | covered |
| §11.3, §14.3, §9.13, §5.1 | tasks/T-015.json | 13-e | T2-api (calibration actions) | covered |
| §11.4, §7.2 D-MNT-14, §9.14, §14.3, §14.5 | tasks/T-016.json | 13-e | T2-api (sanitation actions) | covered |
| §7.1 D-MNT-4, §11.6, §6.2, §9.5 | tasks/T-017.json | 13-c | T2-api (cross-module consumer) | covered |
| §10.1, §10.3 | tasks/T-018.json | 13-c | T3-ui (dashboard) | covered |
| §10.3 MNT-015, MNT-016, §10.4 MNT-M-01, MNT-M-14 | tasks/T-019.json | 13-a | T3-ui (assets) | covered |
| §10.3 MNT-022, MNT-023, §10.4 MNT-M-02, §11.7 | tasks/T-020.json | 13-b | T3-ui (PM) | covered |
| §10.3 MNT-017..020, §10.4 MNT-M-03 | tasks/T-021.json | 13-c | T3-ui (WR+MWO list) | covered |
| §10.3 MNT-021, §10.4 MNT-M-04/M-12/M-13, §11.1-11.4 | tasks/T-022.json | 13-c | T3-ui (MWO detail) | covered |
| §10.3 MNT-026, MNT-027, §10.4 MNT-M-07/M-08 | tasks/T-023.json | 13-d | T3-ui (spares) | covered |
| §10.3 MNT-024, MNT-025, §10.4 MNT-M-05/M-06, §14.1, §14.3 | tasks/T-024.json | 13-e | T3-ui (calibration) | covered |
| §10.3 MNT-030, §10.4 MNT-M-10/M-11, §11.2, §7.2 D-MNT-15 | tasks/T-025.json | 13-c | T3-ui (LOTO safety) | covered |
| §10.3 MNT-028, MNT-029, §10.4 MNT-M-09, §14.4, §4 | tasks/T-026.json | 13-a | T3-ui (technicians+GDPR) | covered |
| §10.3 MNT-031, MNT-032, §9.16, §13.2 | tasks/T-027.json | 13-e | T3-ui (analytics+settings) | covered |
| §6.4, §14.2 (rate-limit + observability wiring) | tasks/T-028.json | 13-c | T4-wiring-test | covered |
| §10.1, §10.2, §13.1 (12-reporting dashboards_catalog seed) | tasks/T-029.json | 13-c | T5-seed (cross-module) | covered |
| §6.2, §8.2, §12.3 (E2E spine + outbox routing) | tasks/T-030.json | 13-c | T4-wiring-test (Playwright) | covered |

## Cross-cutting concerns (Auditor A closures)

| Concern | Status | Tasks |
|---|---|---|
| **Permissions enum delta** | covered | T-001 (p0-blocker priority 90) — 17 mnt.*.* strings |
| **GDPR right-to-erasure** | covered | T-013 — pseudonymise technician_profiles via Wave1 T-114 orchestrator |
| **i18n PL/EN keys** | covered | T-013 — `maintenance.*` namespace covering all UI + error codes |
| **RLS via app.current_org_id() (no GUC reads)** | covered | T-002, T-003, T-004, T-005, T-006 — all migrations include test asserting policy text |
| **Outbox publisher + 8 events** | covered | T-012 — Zod contracts + dispatcher with DLQ + cross-module routing |
| **apps/worker per-tenant cron loops** | covered | T-009 — 3 cron engines (PM, calibration, reorder) + T-017 auto-downtime consumer using Wave1 T-111/T-112 |
| **Rate-limit + observability wrappers** | covered | T-028 — Wave1 T-121/T-116..T-118 wired into all 6 Server Action modules |
| **Empty/loading/error/permission states** | required by UI parity policy on every UI task (T-018..T-027) | covered |
| **Playwright artifacts in closeout** | covered | UI-PROTOTYPE-PARITY-POLICY.md cited as `ui_evidence_policy` on all UI tasks; T-030 dedicated E2E trace |
| **Cross-module integration (CIG-3 downtime→MWO)** | covered | T-017 + T-030 E2E asserts outbox routing to 12-reporting/15-OEE/09-quality |
| **Cross-module FK doc (D-MNT-10 calibration ⇄ 09-quality)** | covered (comment only) | T-006 adds SQL comment; live FK is 09-quality task |
| **Sanitation allergen → 08-production gate (D-MNT-14)** | covered (event emit only) | T-016 emits `sanitation.allergen_change.completed`; consumer in 08-production |

## P2/deferred (explicit out-of-scope per PRD §16 + backlog)

| Item | Marker | PRD ref |
|---|---|---|
| IoT sensor integration (Modbus/OPC UA) | [EVOLVING] | D-MNT-16, §13.4 |
| Predictive maintenance ML | [EVOLVING] | OQ-MNT-05 P3 |
| TPM 5S autonomous maintenance | [EVOLVING] | §3.2.7 |
| Full LOTO permit system | P2 | OQ-MNT-03 |
| D365 PO push for spare reorder | P2 | §12.2, BL-MAINT-07 |
| External accreditation API for calibration | P2 | §12.2 stage Z |
| `oee_maintenance_trigger_v1` rule evaluation | P2 (stub registered) | D-MNT-11, BL-MAINT-06 |
| MNT-033 Outbox/DLQ UI | P2 | OQ-MNT-11 (rely on 12-reporting `rpt_integration_health`) |
| MNT-034 Sanitation Allergen Audit drilldown | P2 | OQ-MNT-12 |
| MNT-035 PM Skip Audit | P2 | §10.3 |
| Cross-site maintenance benchmark (MNT-009 dashboard) | P2 | 14-multi-site dependency |
| 21 CFR Part 11 full e-sign chain on certs | P2 | §14.3 |
| Photo evidence Required gate for LOTO | P2 | BL-MAINT-02 |
| Remote two-person LOTO confirmation | P2 | BL-MAINT-04 |
| DnD kanban for WR list | P2 | BL-MAINT-DnD |
| PDF Skills Matrix export | P2 | BL-MAINT-05 |

## Notes

- Equipment table (T-002 §9.3) IS the asset registry — no separate `assets` table per Auditor A slice MNT-001 (PRD uses `equipment` consistently).
- Work Request unified with MWO per D-MNT-9 (state='requested' on `maintenance_work_orders` table). No separate `work_requests` table.
- All Server Actions in T-010/T-011/T-014/T-015/T-016/T-017 are wrapped by T-028 observability + rate-limit (safety bucket 10/min on LOTO actions).
- 15-OEE `oee_shift_metrics` MTBF/MTTR is consumed read-only per D-MNT-3 — analytics tab T-027 must display \"Sourced from 15-OEE\" data-source banner; no independent MTBF computation in maintenance.
- Calibration ⇄ 09-Quality FK (D-MNT-10) is documented as forward-compat comment only in T-006; the live FK is added by a 09-quality migration in a later wave.
- Sanitation allergen-change event (D-MNT-14) is emitted by T-016 to 08-production `allergen_changeover_gate_v1` consumer — the consumer-side rule evaluation is an 08-production task.
- 12-reporting `dashboards_catalog` seed (T-029) registers 6 P1 + 8 P2 dashboards per §10.1/§10.2; requires 12-reporting table to exist or the task blocks.
