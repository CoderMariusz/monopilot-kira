# 14-MULTI-SITE Atomic Task Coverage

PRD: `docs/prd/14-MULTI-SITE-PRD.md` (v3.2 — Phase D + Direction-B Transport Lanes reconciliation)
Bootstrap audit source: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §14-MULTI-SITE slice (8 priority slices MS-001..MS-008)

## Sub-module map

| Sub-module | Scope | Tasks |
|---|---|---|
| **14-a** | Core schema + RLS + foundation extension (`app.current_site_id()` + `withSiteContext`) + site context middleware | T-001..T-007 |
| **14-b** | Inter-site TO extension (transfer_orders ALTER) + IN_TRANSIT state machine + dual approval gates + 3 outbox events + cost allocation | T-008..T-011 |
| **14-c** | Transport Lanes + Rate Cards (§10A) — tables + supersede chain + lane suggestion API + CRUD UI + rate card upload wizard | T-012..T-016 |
| **14-d** | Master-data sync + replication queue + conflict resolution e-sig (BL-MS-02 fix) + retry/run-sync modal | T-017..T-019 |
| **14-e** | Site management UI — switcher, list, detail, activation wizard, decommission, permissions matrix, config overrides | T-020..T-026 |
| **14-f** | Cross-site dashboards + materialized view + activation migration (ALTER+backfill 20 tables) | T-027..T-030 |
| **14-g** | Permissions enum addition (26 `multi_site.*.*` strings) | T-031 |

## Audit slice (MS-001..MS-008) → task mapping

| Audit slice | Coverage | Tasks |
|---|---|---|
| **MS-001** sites table + RLS extension | covered | T-001 (foundation extension current_site_id), T-002 (sites table), T-003 (site_user_access), T-004 (site_settings), T-005 (hierarchy_config + capacity), T-006 (site_access_policy_v1 rule + generator), T-007 (x-site-id middleware) |
| **MS-002** Inter-site transfers (IST) state machine | covered | T-008 (ALTER cols), T-009 (state machine IN_TRANSIT), T-010 (approval + outbox), T-011 (cost allocation), T-029 (tracker UI) |
| **MS-003** Transport lanes + rate cards (BLOCKER #2) | covered | T-012 (transport_lanes), T-013 (rate_cards + supersede), T-014 (suggestion API), T-015 (CRUD UI), T-016 (upload wizard) |
| **MS-004** Master data sync (Settings reference replication) | covered | T-017 (outbox events + replication queue schema) |
| **MS-005** Replication queue + conflict resolution | covered | T-017 (queue schema), T-018 (conflict resolve + V-MS-30 e-sig fix), T-019 (retry/run-sync) |
| **MS-006** Site activation wizard + decommission | covered | T-023 (activation wizard), T-024 (decommission), T-030 (ALTER+backfill migration) |
| **MS-007** `ms_dashboard` + `ms_sites_list` + `ms_lanes_list` UI parity | covered | T-021 (sites list), T-022 (site detail), T-028 (MS-001 dashboard), T-029 (MS-002 tracker), T-015 (lanes list+detail) |
| **MS-008** Permissions enum delta | covered | T-031 (26 multi_site.*.* strings) |

## Coverage rows

| PRD ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §9.1 sites + V-MS-01/04 | tasks/T-002.json | 14-a | T1-schema | covered |
| §9.2 site_user_access + V-MS-05/06 | tasks/T-003.json | 14-a | T1-schema | covered |
| §9.3 site_settings + §13.2 ADR-031 | tasks/T-004.json | 14-a | T1-schema | covered |
| §9.4 + §9.5 sites_hierarchy_config + site_capacity | tasks/T-005.json | 14-a | T1-schema | covered |
| §8 site_access_policy_v1 rule + §11.2 V-MS-08 | tasks/T-006.json | 14-a | T2-api | covered |
| §11.4 V-MS-15..17 + §6.2 x-site-id middleware | tasks/T-007.json | 14-a | T2-api | covered |
| §9.1 current_site_id() + §15.1 helper (foundation extension) | tasks/T-001.json | 14-a | T2-api | covered |
| §9.6 transfer_orders ALTER cols | tasks/T-008.json | 14-b | T1-schema | covered |
| §8.2 to_state_machine_v1 + V-MS-09/12 | tasks/T-009.json | 14-b | T2-api | covered |
| §11.3 V-MS-10/11 + §12.3 outbox events | tasks/T-010.json | 14-b | T2-api | covered |
| §11.3 V-MS-13/14 + 10-FIN handoff | tasks/T-011.json | 14-b | T2-api | covered |
| §10A.2.1 transport_lanes + V-MS-24 | tasks/T-012.json | 14-c | T1-schema | covered |
| §10A.2.2 rate_cards + §10A.3.4 supersede + V-MS-25/27/28 | tasks/T-013.json | 14-c | T1-schema | covered |
| §10A.3.1 + §10A.3.3 lane suggestion + V-MS-26 | tasks/T-014.json | 14-c | T2-api | covered |
| §10A list + detail (MS-100) | tasks/T-015.json | 14-c | T3-ui | covered |
| §10A.3.2 + §10A.3.4 rate card upload wizard | tasks/T-016.json | 14-c | T3-ui | covered |
| §12.3 + §10A.4 + D-MS-12 outbox + replication queue | tasks/T-017.json | 14-d | T1-schema | covered |
| §10B MS-103 + V-MS-30 e-sig (BL-MS-02 fix) | tasks/T-018.json | 14-d | T3-ui | covered |
| §10B MS-106 + V-MS-22 retry/run-sync | tasks/T-019.json | 14-d | T3-ui | covered |
| §10.1 MS-004 site switcher + V-MS-17 | tasks/T-020.json | 14-e | T3-ui | covered |
| §10C MS-114 sites list | tasks/T-021.json | 14-e | T3-ui | covered |
| §10C MS-115 site detail (8 tabs) + BL-MS-04 mobile | tasks/T-022.json | 14-e | T3-ui | covered |
| §13.5 D-MS-14 + V-MS-18/19 activation wizard | tasks/T-023.json | 14-e | T3-ui | covered |
| §10B MS-104 + V-MS-21 site decommission | tasks/T-024.json | 14-e | T3-ui | covered |
| §10B MS-101 site permissions matrix + bulk CSV | tasks/T-025.json | 14-e | T3-ui | covered |
| §10B MS-102 site config override | tasks/T-026.json | 14-e | T3-ui | covered |
| §9.10 cross_site_summary MV + pg_cron | tasks/T-027.json | 14-f | T1-schema | covered |
| §10.1 MS-001 site overview dashboard | tasks/T-028.json | 14-f | T3-ui | covered |
| §10.1 MS-002 IST tracker dashboard | tasks/T-029.json | 14-f | T3-ui | covered |
| §9.8 + §11.5 V-MS-18/19 + D-MS-13/14 site_id activation migration | tasks/T-030.json | 14-f | T1-schema | covered |
| §10A.5 + §10B RBAC + §11.5 + §14.2 permissions enum | tasks/T-031.json | 14-g | T1-schema | covered |

## Cross-module dependencies declared

| From task | Cross-module dep | Reason |
|---|---|---|
| T-001 | 00-foundation T-125 (withOrgContext) + T-007 (set_org_context) | `withSiteContext` composes on T-125; mirrors session_org_contexts trust contract. **Foundation extension** — coverage row to be added in 00-foundation/coverage.md under "Tenant-context extension — site_id". |
| T-002, T-003, T-004 | 00-foundation T-007 | RLS depends on `app.current_org_id()` |
| T-003 | 02-settings roles_catalog | role column FK-soft references |
| T-004 | 02-settings ADR-031 | L1 org_config fallback layer |
| T-006 | 02-settings §7.8 rules registry | `site_access_policy_v1` stored in `rule_definitions` |
| T-007 | 00-foundation T-011 (auth middleware), T-117 (observability redact) | Supabase session callback + redact allowlist for session_token |
| T-008 | 05-warehouse transfer_orders base | ALTER extends 05-WH-owned table |
| T-009 | 05-warehouse `to_state_machine_v1` v1 + 02-settings §7.8 | extends rule to v2 |
| T-010 | 00-foundation T-111 (outbox), T-112 (worker), 05-warehouse `warehouse_outbox_events` | outbox table owned by 05-WH; worker dispatcher in foundation |
| T-011 | 10-finance `inventory_cost_layers`, 00-foundation T-112/T-117 | cost ledger consumer + worker scaffold + redact |
| T-014 | 00-foundation T-117 | observability redact for rate card pricing |
| T-016 | 00-foundation T-117 | redact for rejected rate values |
| T-017 | 00-foundation T-111/T-112 | event_catalog (foundation-owned) + worker consumes replication_jobs |
| T-018 | 02-settings reauthenticate, 00-foundation T-117 + T-124 (e-sig primitive) | V-MS-30 e-sig fix (BL-MS-02) — wires to existing 02-SET re-auth + T-124 platform primitive |
| T-019 | 00-foundation T-112 | worker consumes replication_jobs |
| T-022 | 05-warehouse inventory view, 08-production work_orders | Site detail tabs consume per-site filtered views |
| T-023 | 02-settings org_settings | activation state machine column owned by 02-SET org-config domain |
| T-024 | 00-foundation T-113 (GDPR retention), 08-production work_orders, 09-quality quality_holds | 7y retention tag + V-MS-21 pre-condition queries |
| T-026 | 02-settings config_schema ADR-031 | reads config_schema for type/options |
| T-027 | 00-foundation pg_cron, 12-reporting dashboards_catalog | MV refresh schedule + dashboard registration |
| T-028 | 12-reporting dashboards_catalog | MS-001 dashboard registration |
| **T-030** | **05-WH, 08-PROD, 09-QA, 10-FIN, 11-SHIP, 13-MAINT, 15-OEE, 00-foundation T-112** | **20 §9.8 operational tables across 7 modules + worker scaffold runs background activation job. Highest cross-module surface in module 14.** |
| T-031 | 02-settings T-001 (enum file), T-046 (enum-lock ESLint guard) | new `ALL_MULTI_SITE_PERMISSIONS` recognised by guard |

## Foundation extension flag

**T-001 is a foundation extension task**, not a 14-MULTI-SITE-internal task. It creates the `app.current_site_id()` SQL helper + `app.set_site_context()` setter + `app.session_site_contexts` trust table + `withSiteContext` TypeScript HOF — all of which are foundation primitives consumed across 8 modules (05-WH / 08-PROD / 09-QA / 10-FIN / 11-SHIP / 12-REP / 13-MAINT / 15-OEE) for site-scoped RLS.

Coverage row in foundation `coverage.md` to be added under section `## Tenant-context extension — site_id (14-multi-site dependency T-001)` per T-001's `scope_files` list. Coordinate with 00-foundation owners to register this as a carry-forward extension on top of T-125 `withOrgContext`.

## P0 blockers

- **T-001** (priority 30) — foundation extension `app.current_site_id()` + `withSiteContext` HOF. No 14-* site-scoped task can be implemented without this.
- **T-030** (priority 90) — site_id activation migration; touches 20 tables across 9 modules; gates `multi_site_state` transition from `dual_run` → `activated`.
- **T-031** (priority 90) — permission enum addition (`multi_site.*.*`); ESLint enum-lock guard from 02-SET T-046 will block any UI/Server Action referencing these strings until enum is updated.

## Notes

- All schema tasks use `app.current_org_id()` + `app.current_site_id()` foundation helpers — never raw `current_setting()` GUC reads (RLS contract per Wave0 v4.3 + this module's foundation extension T-001).
- All site-scoped tables follow the §6.4 + §9.8 split: master tables stay org-scoped; operational tables site-scoped via T-006 generator + T-030 activation.
- UI tasks reference prototype paths from `prototype-index-multi-site.json` with explicit `file:lines` ranges. Translation notes in `_meta/prototype-labels/translation-notes-multi-site.md` govern translation decisions (BL-MS-01 map placeholder, BL-MS-02 e-sig wiring, BL-MS-04 mobile accordion, BL-MS-05 chart Recharts, BL-MS-06 heartbeat P2, BL-MS-07 hierarchy wizard P2).
- Validation rules V-MS-01..V-MS-30 (all 30) cross-referenced in their owning tasks — none orphaned.
- Direction A (PRD-only, no design): MS-007/MS-008/MS-009 P2 dashboards deferred to Phase E P2 wave; not included in this bootstrap.
- `OQ-MS-11` (e-sig wiring) resolved by T-018 → reuse 02-SET reauthenticate (not bespoke). `OQ-MS-12` (MS-110 vs 12-REP overlap) deferred to Phase E. `OQ-MS-13` (`sites_screen` mis-tag) — out of scope of this bootstrap (prototype-index hygiene).
- Audit `_meta/audits/2026-05-14-permission-enum-addition.md` covers modules 01-09; this bootstrap adds module 14 in T-031 following the same pattern.
