# Forward-looking PLAN/TASK Audit — 10-finance · 12-reporting · 15-oee

**Mode:** READ-ONLY. No code modified. No tasks created — gaps captured as stubs under
`_meta/runs/sidecar/proposed-tasks/`.
**Date:** 2026-06-04
**Auditor:** sidecar agent (Opus)
**Inputs read:** `docs/prd/{10-FINANCE,12-REPORTING,15-OEE}-PRD.md`, each module's
`manifest.json` + `STATUS.md` + `coverage.md` + every `tasks/T-*.json`, the PRD amendment
audits (`_meta/audits/2026-04-30-prd-amendments-*`), prototypes, prototype-label indexes,
MON-domain skills, `apps/web/lib/navigation/app-nav.ts`, and the 01-NPD costing waterfall
(`docs/prd/01-NPD-PRD.md §17.11.3`, task `01-npd/T-070`).

---

## 0. Executive verdict

| Module | Tasks | Implemented | Coverage vs PRD | Clarity verdict |
|---|---|---|---|---|
| **10-finance** | 32 | 0 (1 stub: `finance/page.tsx`) | Complete for P1; tight cross-module contracts | **BUILD-READY** with 2 fixes (NUMERIC precision conflict; finance/page.tsx route path mismatch) |
| **12-reporting** | 27 | 0 (1 stub: `/reporting` landing) | Complete for P1 | **BUILD-READY** with 1 gap (no MON-domain-reporting skill) |
| **15-oee** | 25 | 0 (1 stub: `/oee/settings/shifts`) | Complete for P1 | **BUILD-READY** with 1 confirmed structural flag (F-5: T-002 DDL on producer-owned `oee_snapshots`) |

**Headline:** All three modules are exceptionally well-decomposed (gold-standard T1→T2→T3→T4→T5
chains, coverage.md mapping every task to PRD anchors, dependency DAGs, P0-blocker permission
tasks). The task JSONs are *higher quality than the PRDs* — they already remediate the stale
`tenant_id` PRD language to Wave0 `org_id`. The findings below are precision/ownership/skill
gaps, not missing-feature holes. **No major missing-task gaps found**; the proposed stubs are
small clarifications, not new epics.

---

## 1. 10-FINANCE

### 1.1 Task inventory
- **32 tasks, 0 implemented.** Sub-modules: perm (T-001), 10-a Setup (T-002..008),
  10-b Standard Costs (T-009..014), 10-c WO Actual Costing (T-015..020),
  10-d Variance+Valuation (T-021..026), 10-e D365 stage 5 (T-027..030),
  10-cross Dashboard+Reports (T-031..032).
- Stub: `apps/web/app/[locale]/(app)/(modules)/finance/page.tsx` = `ModuleStubNotice` landing
  (T-031 target, nav wired in `app-nav.ts:67`).
- coverage.md maps all 32 to PRD anchors and to Auditor-A's 10 priority slices (all 10 covered).

### 1.2 Costing roll-up cross-check (01-NPD relationship) — RESOLVED, no conflict
The audit brief asked whether 10-finance consumes/extends the 01-NPD 9-step costing waterfall.
**They are distinct layers, correctly separated:**
- **01-NPD waterfall** (`costing_breakdowns` + `costing_waterfall_steps`, task `01-npd/T-070`,
  PRD §17.11.3): a *design-time* what-if costing tool for NPD stage screens — Raw materials →
  Yield loss → Process labour → Packaging → Overhead → Logistics → Margin → Distributor →
  Retail, with 3 margin scenarios. It is product-development planning, scenario-scoped.
- **10-finance** (PRD §6/§9): *operational* per-WO actual costing — `work_order_costs`,
  `material_consumption_costs`, `labor_costs`, `overhead_allocations`, cascade rollup via
  recursive CTE (T-016), co-product allocation (T-017).
- The "waterfall chart" in finance tasks T-020/T-031 is a Recharts **visualization** of MTD
  standard-vs-actual cost breakdown — NOT a read of `costing_waterfall_steps`.
- **Linkage that DOES exist:** `items.cost_per_kg` is dual-owned (schema 03-TECH, lifecycle
  10-FIN per D-FIN-9), realized in T-010 via a column-level trigger on the `app.permissions`
  GUC. 01-NPD writes the *initial/target* cost_per_kg at design; 10-FIN owns the operational
  lifecycle. This is clean and intentional. **No missing consume task.**
- **Note for build:** there is no task that reconciles the NPD design waterfall's `target_price`
  / margin against the operational `standard_costs`. PRD scopes margin analysis to P2
  (EPIC 10-G), so this is *correctly deferred*, not a P1 gap. Flagged as advisory stub
  `m10-S3` for traceability only.

### 1.3 Money MUST be NUMERIC-exact — **CONFLICT FOUND (F-FIN-1, high)**
- **MON-domain-finance/SKILL.md (lines 47-56) mandates Money = `NUMERIC(18,4)`**, qty
  `NUMERIC(14,3)`, percent `NUMERIC(8,2)`, FX `NUMERIC(12,6)`.
- **PRD §6.4 DDL and the finance task JSONs use `NUMERIC(15,4)` for money** (12 occurrences
  across tasks), `NUMERIC(12,3)` for qty (5×), `NUMERIC(15,6)` for FX, `NUMERIC(8,2)` percent,
  one `NUMERIC(16,4)` (`item_wac_state.total_value`), one `NUMERIC(10,4)`.
- This is a direct precision contradiction between the implementation skill and the tasks. At
  GBP scale 15,4 is fine for unit costs but `(15,4)` caps a single value at ~99 billion which
  is adequate; however the **skill is the authority the agents will read**, so a builder
  following the skill will write `(18,4)` while the task DDL says `(15,4)`, producing
  migration/Drizzle mismatches and test churn. **Reconcile to one precision policy before
  10-a starts** (recommend adopting the skill's `(18,4)` money / `(14,3)` qty as the standard,
  or amend the skill to match the PRD). Captured as stub **m10-S1**.
- Positive: every money column IS pinned (no bare `NUMERIC`), and GENERATED STORED columns are
  used for totals/variances — NUMERIC-exact arithmetic is preserved.

### 1.4 GL/postings + variance — complete
- D365 stage 5 is **export-only** (R15 anti-corruption) — outbox (`finance_outbox_events`) +
  DLQ (`d365_finance_dlq`) + daily consolidator (T-027/T-028/T-029/T-030). PRD §3.2 correctly
  excludes full GL/AR/AP (stays in D365 F&O). No internal double-entry ledger — correct scope.
- Variance: T-015 carries GENERATED variance columns; T-024 yield variance per WO + monthly
  `v_yield_loss_monthly` (consumes 09-QA `ncr_reports` read-only). MPV/MQV/LRV/LEV decomposition
  is P2 (EPIC 10-I) — P1 UI shows muted "Phase 2" placeholder tiles (BL-FIN-01). Correct.
- Cascade rollup (T-016): recursive CTE with cycle guard reusing 04-PLANNING V-PLAN-WO-CYCLE —
  good (27 "cascade" / 23 "cycle" / 7 "recursive" / 2 "V-PLAN-WO-CYCLE" refs in the task).

### 1.5 Minor gaps / clarity nits
- **F-FIN-2 (route-path mismatch, medium):** finance UI tasks write to
  `apps/web/app/finance/...` (e.g. T-020 `app/finance/wos/[woId]/cost/page.tsx`,
  T-031 `app/finance/page.tsx`) but the live stub + nav live under the locale group
  `apps/web/app/[locale]/(app)/(modules)/finance/`. Tasks omit the `[locale]/(app)/(modules)`
  segment. This will create a *second* un-routed tree or break next-intl locale routing.
  Same pattern risk in 12-reporting and 15-oee UI tasks. **Normalize all UI file paths to the
  `[locale]/(app)/(modules)/<module>/` convention before any T3-ui wave.** Captured as
  cross-cutting stub **m10-S2** (applies to all 3 modules).
- **fiscal_periods / Period-Lock (FIN-020):** correctly P2-stubbed (disabled button + "Phase 2"
  badge, gated in T-005 settings; `fiscal_periods` table NOT created this module). Note:
  12-reporting T-010 builds a **separate** `fiscal_periods` + `generate_fiscal_periods()`
  fiscal-calendar engine. If finance later un-stubs period-lock it should consume reporting's
  fiscal calendar, not create a parallel one — flag for future, not a P1 gap.

### 1.6 Dependency / canonical-owner table (10-finance)
| Direction | Counterparty | Mechanism | Owner check |
|---|---|---|---|
| IN | 08-production | `work_orders`, `wo_outputs`, `wo_waste_log`, consumption events; §12 outbox template | `wo_outputs` canonical = 08 ✓ (finance reads only) |
| IN | 05-warehouse | `license_plates` FK (FIFO layers, consumption cost) | LP owner = 05 ✓ |
| IN | 04-planning-basic | `wo_dependencies` DAG (cascade rollup) | ✓ |
| IN | 03-technical | `items.cost_per_kg` (dual-owned), `bom_co_products.allocation_pct` | cost_per_kg = dual (schema 03, lifecycle 10) per D-FIN-9 ✓ |
| IN | 09-quality | `ncr_reports.claim_value_eur` (read-only via v_yield_loss_monthly) | NCR owner = 09 ✓ |
| IN | 02-settings | `rules_registry`, D365 `d365_constants` §11, tax_codes | ✓ |
| IN | 00-foundation | T-111/112 worker+outbox, T-125 withOrgContext, T-046 enum-lock, T-124 e-sign, R14/R15 | ✓ |
| OUT | 12-reporting | `finance.standard_cost.approved`, `finance.cost_per_kg.changed`, `finance_outbox_events` (UNION into mv_integration_health) | reporting reads only ✓ |
| OUT | 11-shipping | COGS per shipment (P2) | deferred ✓ |
| OUT | external D365 F&O | GeneralJournalLine DMF (export-only, R15) | ✓ |

### 1.7 RBAC / reachability / nav
- T-001 = P0 blocker locking 14 `fin.*.*` strings in `packages/rbac/src/permissions.enum.ts`
  (ESLint enum-lock guard T-046 fails downstream tasks without it). Correct.
- RLS matrix in PRD §2.3 is explicit per role; tasks enforce `app.current_org_id()` + FORCE RLS.
- Nav: `sidebarItem("finance")` present (`app-nav.ts:67`). Route reachable. Good.

### 1.8 Build-readiness
- Prototypes: present (`prototypes/design/Monopilot Design System/finance/` — 9 JSX files).
- Label index: `_meta/prototype-labels/prototype-index-finance.json` present (coverage.md: 22/32
  tasks `prototype_match:true`, 24/25 indexed entries used).
- Skill: **MON-domain-finance present** (but see F-FIN-1 precision conflict — the skill itself
  must be reconciled).

---

## 2. 12-REPORTING

### 2.1 Task inventory
- **27 tasks, 0 implemented.** perm (T-001), KPI glossary (T-002), MVs
  (T-003/006/007/010/014), support tables (T-004/008), API/actions (T-005/009/011/012/013),
  UI dashboards (T-015..023), modals+settings (T-024/025/026), E2E (T-027).
- Stub: `/reporting` landing (`ModuleStubNotice`), nav wired (`app-nav.ts:71`).

### 2.2 Read-models / aggregations / export / dashboards — complete
- **Read-models:** 10 P1 materialized views (yield by line/sku/week, factory KPI, QC holds,
  downtime, inventory aging, WO status, shipment OTD, integration health, rules usage) across
  T-003/006/007/014. Refresh worker T-005 (2-min prod / 5-min QC cadence, pg_cron primary +
  Edge Function fallback, advisory-lock, 3-failure auto-disable, CONCURRENTLY refresh requiring
  unique indexes). Solid.
- **KPI glossary (T-002):** 16 version-controlled P1 KPI formulas
  (`_foundation/contracts/reporting-kpi-glossary.md` + TS export). Good — single source of
  truth for formula parity. Reporting consumes upstream formulas; does not redefine OEE calc.
- **Export (T-013):** PDF Edge Function + CSV stream + `report_exports` writer with SHA-256
  + 7-year GENERATED `retention_until` (BRCGS). access-deny audit (T-004). Correct.
- **Dashboards (T-015..023):** metadata-driven `dashboards_catalog` (10 P1 + 15 P2 stubs,
  feature-flag gated) replacing hardcoded catalog (T-008). Good extensibility.

### 2.3 OEE consumer boundary — CLEAN (no write to OEE tables)
- T-011 is a **read-only** consumer of `oee_daily_summary` (the task body states "read only";
  10 refs, zero INSERT/UPDATE). Reporting never writes to OEE or production tables (PRD §12.1
  "12-REPORTING NIE produkuje eventow"; T-014 has explicit red-line "Do not write to outbox
  tables"). No canonical-owner violation.

### 2.4 tenant_id → org_id remediation — DONE at task level
- PRD body uses `tenant_id` 21× (stale). **All 4 task files that mention it (T-004/005/008/014)
  carry explicit red-lines** "Do not name scope column tenant_id — Wave0 v4.3 mandates org_id"
  + AC assertions that `pg_policies` reference `app.current_org_id()` and contain no
  `current_setting('app.tenant_id')`. **Tasks are Wave0-compliant; only the PRD prose is dirty
  (cosmetic).** Recommend a PRD-prose sweep but not a blocker.

### 2.5 site_id retrofit note (sidecar F-1)
- Reporting MVs already carry `site_id` in their grouping (PRD §9.2 source map rows; T-003/007
  group by org_id, site_id). Because the source tables (08-PROD, 05-WH, 09-QA) may not have
  day-1 `site_id`, the reporting MVs inherit the same F-1 retrofit risk: if upstream `site_id`
  is added later, every dependent MV definition + unique index must be re-issued. **Flag:**
  reporting MV tasks assume `site_id` exists on upstream tables; verify upstream day-1 site_id
  (14-multi-site REC-L1) before T-003/006/007 run, else MVs need a follow-up ALTER. Stub
  **m12-S2**.

### 2.6 Dependency / canonical-owner table (12-reporting)
| Direction | Counterparty | Mechanism | Owner check |
|---|---|---|---|
| IN | 08-production | `wo_outputs`, `wo_consumptions`, `downtime_events`, `wo_executions` (MV sources) | read-only ✓ |
| IN | 09-quality | `quality_holds`, `hold_items` (mv_qc_holds, T-006/012) | read-only ✓ |
| IN | 05-warehouse | `license_plates` (mv_inventory_aging, T-007) | read-only ✓ |
| IN | 11-shipping | `sales_orders` (mv_shipment_otd, T-007) | read-only ✓ |
| IN | 15-oee | `oee_daily_summary` MV (T-011) | OEE is producer; reporting reads ✓ |
| IN | 10-finance | `finance_outbox_events` (mv_integration_health UNION, T-014) | read-only ✓ |
| IN | 02-settings | `rule_evaluations` audit (mv_rules_usage), `fiscal_calendar_type`, feature flags | read-only ✓ |
| IN | 00-foundation | T-111 worker (refresh job), T-112 outbox subscriber, T-116 OTel, T-117 pino, T-121 rate-limit, T-123 Playwright | ✓ |
| OUT | — | none (no reverse dependency; reporting is a pure sink) | ✓ |

### 2.7 RBAC / reachability / nav
- T-001 = P0 blocker (`rpt.*` enum baseline absent). T-009 `report_access_gate_v1` DSL rule +
  middleware enforcement + `report_access_audits`. PRD §11 includes RLS-bypass-attempt tests
  (session tenant != query param → 403). Good preventive RBAC.
- Nav: `sidebarItem("reporting")` in `analytics-network` group (`app-nav.ts:71`). Reachable.

### 2.8 Build-readiness
- Prototypes: present (9 JSX files under `reporting/`).
- Label index: `_meta/prototype-labels/prototype-index-reporting.json` present and rich
  (dashboards, KPI screens, modals, admin screens all labeled).
- **Skill GAP (F-RPT-1, medium): there is NO `MON-domain-reporting` skill.** Finance and OEE
  both have domain skills; reporting does not. Builders of T-003..T-027 have no consolidated
  reporting playbook (MV refresh discipline, CONCURRENTLY-requires-unique-index rule, KPI
  glossary as SoT, export retention, read-only-sink boundary). Recommend creating one before
  the reporting wave. Captured as stub **m12-S1**.

---

## 3. 15-OEE

### 3.1 Task inventory
- **25 tasks, 0 implemented.** perm (T-001), consumer surface + ref tables
  (T-002/003/004), seed (T-005), MVs (T-006/007/023), API/worker
  (T-008/009/010/011/012/013), UI dashboards+drilldowns (T-014..019), admin
  (T-020/021/022), tests (T-024/025).
- Stub: `/oee/settings/shifts` (`SettingsRouteStub`), nav `sidebarItem("oee")` (`app-nav.ts:68`).

### 3.2 A/P/Q/Q calculation — correctly NOT in 15-oee (no missing calc task)
- OEE PRD D-OEE-1 is explicit: **15-OEE does NOT implement its own aggregation/calc logic.**
  Availability/Performance/Quality and `oee_pct = A×P×Q` are computed by 08-PRODUCTION's
  `oee_aggregator` cron (every 60s) which writes `oee_snapshots`. 15-OEE is a pure
  analytics/visualization layer: it builds 2 rollup MVs (`oee_shift_metrics` T-006,
  `oee_daily_summary` T-007) that AVG/SUM the pre-computed snapshot factors, plus the
  `shift_aggregator_v1` rule (T-008). **There is correctly no "compute A/P/Q" task** — that
  would duplicate 08-PROD and is explicitly forbidden (PRD §3 "Custom OEE formula per tenant"
  out-of-scope; "OEE calculation in frontend" out-of-scope; calc is backend Postgres only).
  No missing-calc gap.

### 3.3 oee_snapshots READ-ONLY (D-OEE-1) — **F-5 CONFIRMED + nuanced**
The sidecar F-5 flag (15-oee/T-002 ALTERs `oee_snapshots`) is **CONFIRMED**:
- **T-002 performs DDL on a producer-owned table:**
  `ALTER TABLE oee_snapshots ADD COLUMN IF NOT EXISTS site_id UUID;`
  `CREATE INDEX idx_oee_site_line_time ...;` and — per its implementation contract step 2 —
  **adds/replaces RLS policies** on `oee_snapshots` if they reference `current_setting()`.
- **It is authorized by the OEE PRD itself:** §9.1 lines 497-499 literally specify
  "REC-L1 site_id extension (added in 15-OEE scope) — `ALTER TABLE oee_snapshots ADD COLUMN
  site_id UUID; CREATE INDEX idx_oee_site_line_time ...`". So the PRD deliberately assigns the
  site_id column-extension to 15-OEE's scope (REC-L1 day-1).
- **The read-only rule (CLAUDE.md hard rule + D-OEE-1) is about DATA writes**
  (INSERT/UPDATE/DELETE rows), which T-002 explicitly forbids (4 separate red-lines, AC #1
  asserts no write paths). The ambiguity is *structural ownership*: `oee_snapshots` is created
  by **08-production T-008** (PRD §9.9), and having a *consumer* module ALTER the schema +
  replace RLS of a *producer-owned* table is a soft boundary violation even if PRD-sanctioned.

  **Recommendation (flag, builder decision):** keep the read-only DATA contract, but **move the
  `site_id` column + index + RLS DDL into 08-production's migration** (the owner) and reduce
  15-OEE/T-002 to (a) a pre-flight assertion that the column/index exist, and (b) the read-only
  Drizzle Select schema. This preserves canonical ownership (producer owns ALL schema of its
  table) without losing the REC-L1 day-1 requirement. If the team prefers to keep T-002 as the
  ALTER owner (per PRD §9.1), explicitly document the exception in 08-production's STATUS and
  add a guard test that 15-OEE never gains INSERT/UPDATE grant on `oee_snapshots`.
  Captured as stub **m15-S1**.
- **Compounding risk:** T-002 is *hard-blocked* — 08-production T-008 (`oee_snapshots` CREATE)
  is itself ⛔ MISSING (08-production not built). T-002's pre-flight "fail fast if table absent"
  is correct, but the whole 15-OEE module cannot start until 08-production ships
  `oee_snapshots`. STATUS.md already flags this. No other 15-OEE task writes to `oee_snapshots`
  (T-006/T-007 read-only MVs with explicit "Do not write to oee_snapshots" red-lines). **F-5 is
  the ONLY oee_snapshots-write surface, and it is schema-only, PRD-authorized, data-read-only.**

### 3.4 site_id retrofit (sidecar F-1) — directly relevant
- T-002/003/004 all add `site_id UUID NULL` REC-L1 day-1 with a comment that the FK to
  `sites`/`site_user_access` is added later by 14-multi-site if those tables are absent. This is
  the **correct** handling of F-1 (don't retrofit later; reserve nullable day-1). Good. The only
  residual is that RLS policies in T-003/T-004 reference `site_user_access` which may not exist
  pre-14-multi-site — tasks should degrade gracefully (policy on org_id only until site tables
  land). Minor; noted in stub **m15-S2**.

### 3.5 tenant_id → org_id remediation — DONE at task level
- OEE PRD body uses `tenant_id` 35× (stale, incl. all §9.2 MV DDL). **All 6 task files
  (T-002/003/004/006/007/023) carry explicit "map tenant_id → org_id per Wave0 v4.3" red-lines**
  and AC assertions on `app.current_org_id()`. Tasks are Wave0-compliant. PRD prose sweep
  recommended, not a blocker.

### 3.6 Dependency / canonical-owner table (15-oee) — **oee_snapshots emphasis**
| Direction | Counterparty | Mechanism | Owner / read-only check |
|---|---|---|---|
| IN (PRIMARY) | **08-production** | **`oee_snapshots`** (per-minute, BIGSERIAL), `downtime_events`, `changeover_events`, `work_orders` | **PRODUCER = 08 (D-OEE-1). 15-OEE is READ-ONLY DATA consumer.** ⚠ T-002 does *schema* ALTER+RLS — see F-5/m15-S1 |
| IN | 02-settings | `downtime_categories` ref, feature flags, `rule_definitions` registry (§7.8), `changeover_target_duration_min` | read-only ✓ |
| IN | 00-foundation | T-111/112 worker+outbox (T-008/009/010), T-121 rate-limit (T-011) | ✓ |
| IN | 14-multi-site (P2) | `sites` / `site_user_access` for site_id FK + RLS | nullable day-1, FK later ✓ |
| OUT | 12-reporting | `oee_daily_summary` MV (read by RPT-001/RPT-005) | OEE produces MV; reporting reads ✓ |
| OUT | 13-maintenance (P2) | `oee_shift_metrics` MTBF/MTTR + `oee_maintenance_trigger_v1` | P2 stub (T-023) ✓ |
| OUT | downstream consumers | `oee_outbox_events` (separate table, §12.2, 5 events, T-010) | OEE owns its own outbox ✓ (does NOT touch production outbox) |

**Canonical-owner verdict:** the only crossing is the F-5 schema ALTER on producer-owned
`oee_snapshots`. Data writes are clean everywhere. `oee_shift_metrics` / `oee_daily_summary` /
`oee_outbox_events` are all 15-OEE-owned. No `wo_outputs`/`schedule_outputs` crossing.

### 3.7 RBAC / reachability / nav
- T-001 = P0 blocker (`oee.*.*` strings absent, gates T-011..T-022). T-005 seeds
  role→oee.*.* permission. RLS via `app.current_org_id()` + `site_user_access` membership
  (V-OEE-ACCESS-4). PRD §11 V-OEE-DATA-2 CHECK that A/P/Q ∈ [0,100] lives on the 08-PROD table
  (correct — consumer doesn't re-validate producer constraint). Good.
- Nav: `sidebarItem("oee")` (`app-nav.ts:68`). Reachable.

### 3.8 Build-readiness
- Prototypes: present (6 JSX files under `oee/`).
- Label index: `_meta/prototype-labels/prototype-index-oee.json` present.
- Skill: **MON-domain-oee present** (explicitly notes "OEE snapshots READ-ONLY — 08-production
  owns producer per D-OEE-1"). Good — the skill already encodes the F-5 contract.

---

## 4. Cross-cutting findings (all 3 modules)

| ID | Severity | Finding | Affected |
|---|---|---|---|
| **F-FIN-1** | High | NUMERIC precision conflict: MON-domain-finance skill says money `NUMERIC(18,4)` / qty `(14,3)`; PRD+tasks use `(15,4)` / `(12,3)`. Reconcile to one policy before 10-a. | 10-finance |
| **F-PATH** | Medium | UI tasks write to `apps/web/app/<module>/...` but the live app uses `apps/web/app/[locale]/(app)/(modules)/<module>/...`. Normalize all T3-ui file paths to the locale-group convention or risk a duplicate/un-routed tree + broken next-intl routing. | 10, 12, 15 |
| **F-OEE-5** | Medium | (sidecar F-5 confirmed) 15-oee/T-002 ALTERs + replaces RLS on producer-owned `oee_snapshots`. PRD-authorized (§9.1) and data-read-only, but a structural ownership crossing. Prefer moving the schema DDL to 08-production. | 15-oee |
| **F-RPT-1** | Medium | No `MON-domain-reporting` skill (finance + oee have one). Create before reporting wave. | 12-reporting |
| **F-SITE** | Low-Med | (sidecar F-1) Reporting MVs + OEE consumer assume upstream `site_id` exists day-1. OEE handles via nullable REC-L1; reporting MVs depend on upstream tables having site_id — verify before T-003/006/007. | 12, 15 |
| **F-TENANT** | Low (cosmetic) | PRD prose still uses `tenant_id` (10-FIN body clean; 12-REP 21×; 15-OEE 35×). **All task JSONs already remediate to org_id with red-lines + ACs.** PRD-prose sweep recommended; NOT a build blocker. | 12, 15 (prose only) |
| **F-DEP** | Info | None of the 3 modules can start their core waves until upstream producers ship: 08-production (`oee_snapshots`, `wo_outputs`, `wo_waste_log`, downtime), 05-warehouse (`license_plates`), 04-planning (`wo_dependencies`), 09-quality (`quality_holds`/`ncr_reports`), 00-foundation (T-111/112 worker+outbox). All flagged in each STATUS.md. | all |

---

## 5. Missing-task summary

**No missing P1 feature epics** were found — all three modules' coverage.md maps every PRD
section/validation-rule/screen to ≥1 task. The proposed stubs are clarifications/remediations,
not new features:

| Stub | Module | Type | Summary |
|---|---|---|---|
| m10-S1 | 10-finance | Fix (skill/PRD reconcile) | Resolve NUMERIC(18,4) vs (15,4) money precision conflict |
| m10-S2 | 10-finance (+12,15) | Fix (cross-cutting) | Normalize UI file paths to `[locale]/(app)/(modules)/` |
| m10-S3 | 10-finance | Advisory (P2 traceability) | NPD design-waterfall ↔ operational standard_cost reconciliation = P2 (EPIC 10-G), no P1 task — documented |
| m12-S1 | 12-reporting | Gap (skill) | Create MON-domain-reporting skill |
| m12-S2 | 12-reporting | Fix (preventive) | Verify upstream site_id before MV tasks (F-1) |
| m15-S1 | 15-oee | Fix (ownership) | Move oee_snapshots schema ALTER+RLS to 08-production; reduce T-002 to assert+read-only Drizzle (F-5) |
| m15-S2 | 15-oee | Fix (preventive) | RLS policies referencing site_user_access must degrade gracefully pre-14-multi-site |

Stub files: `_meta/runs/sidecar/proposed-tasks/m10-*.md`, `m12-*.md`, `m15-*.md`.

---

## 6. Clarity verdict (per module)

- **10-finance — CLEAR (build-ready after F-FIN-1 + F-PATH).** Costing layers correctly
  separated from NPD; money pinned; cascade/variance/D365-export complete; tight contracts.
  Two fixes block a clean start: the precision conflict and the route-path convention.
- **12-reporting — CLEAR (build-ready after F-RPT-1).** Read-models/export/dashboards complete;
  read-only sink boundary clean; tenant_id already remediated. Only gap is the missing domain
  skill; site_id verification is preventive.
- **15-oee — CLEAR on logic (build-ready after F-OEE-5 decision + 08-production prerequisite).**
  Calc correctly delegated to 08-production (no duplicate); read-only DATA contract honored
  everywhere; the single schema-ownership crossing (T-002 ALTER of oee_snapshots) is
  PRD-authorized but should be reassigned to the producer. Module is hard-blocked on
  08-production shipping `oee_snapshots` first.

*Evidence anchors throughout cite file paths + line numbers / PRD §refs read during this audit.
READ-ONLY — no code or task files were modified.*
