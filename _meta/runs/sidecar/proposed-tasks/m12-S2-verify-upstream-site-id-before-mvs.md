# PROPOSED STUB — m12-S2 (12-reporting): Verify upstream site_id before MV tasks (sidecar F-1)

**Severity:** Low-Medium — preventive.
**Type:** Pre-flight gate (no new feature).

## Problem (evidence)
- Reporting MVs group by `(org_id, site_id, ...)` — PRD §9.2 source map rows + tasks T-003
  (mv_yield_by_line_week / by_sku / factory_kpi) and T-007 (inventory aging / WO status /
  shipment OTD) reference `site_id` on upstream tables (08-PROD wo_outputs/wo_consumptions,
  05-WH license_plates, 11-SHIP sales_orders).
- Sidecar F-1: 14-multi-site assumes a day-1 `site_id` that doesn't yet exist on upstream
  tables. If upstream `site_id` is added LATER, every dependent MV definition + UNIQUE index
  must be re-issued (CONCURRENTLY refresh hinges on the unique index shape).

## Proposed pre-flight (add to T-003/006/007 contracts)
1. Pre-flight assertion: confirm each upstream source table has a `site_id` column (nullable
   REC-L1) before creating the MV. If absent, either (a) block on the upstream day-1 site_id
   retrofit, or (b) create the MV grouped by org_id only with a tracked follow-up ALTER.
2. Document the dependency in 12-reporting/coverage.md cross-module rows.

## Acceptance
- T-003/006/007 fail fast with a clear message if upstream `site_id` is missing, OR explicitly
  degrade to org-only grouping with a recorded follow-up — no silent partial MV.

READ-ONLY proposal.
