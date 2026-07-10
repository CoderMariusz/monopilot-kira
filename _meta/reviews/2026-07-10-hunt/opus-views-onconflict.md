# View-Column & ON CONFLICT Audit — monopilot-kira

## Findings

### P1 — `product` view has no `name` column; Settings→BOMs list silently always empty
- **File:** `apps/web/app/[locale]/(app)/(admin)/settings/boms/_actions/boms.ts:144` (select) and `:161` (group by)
- **Evidence:** query in `getBoms()` does
  ```sql
  coalesce(i.name, p.name, h.product_id, h.fa_code) as product
  ...
  left join public.product p on p.org_id = app.current_org_id() and p.product_code = h.product_id
  ...
  group by ..., i.name, p.name
  ```
  The `public.product` view (latest definition `packages/db/migrations/359-product-as-items-view-cut.sql:61-159`, exact 93-col legacy shape) exposes `product_name` (`i.name as product_name`, line 66) — there is **no `name` column**. No later migration alters this (grepped 360-449). Postgres rejects the whole query at plan time with 42703 `column p.name does not exist`, every time, for every org.
- **Impact:** the catch block at `boms.ts:177-180` swallows the error (`console.error('[settings/boms] load_failed'...)`) and returns `{ kpis: {active:0,draft:0,archived:0}, rows: [] }` — the BOMs settings screen always renders zero BOMs with zero KPIs, masked as success. Fix: `p.product_name`.
- **Severity rationale:** P1 not P0 — no data corruption, but a whole screen is permanently broken and the failure is silent.

No other phantom view columns and **no ON CONFLICT target without unique backing (42P10)** were found.

## Verified CLEAN

**ON CONFLICT (all ~90 distinct `table + target` pairs in `apps/web` non-test code cross-checked against `packages/db/migrations/*.sql` + `449-postdeploy-sweep.sql`):**
- All column-list targets match a UNIQUE constraint / unique index / PK, including schema-qualified tables my first parse flagged: `app.session_org_contexts(session_token)` PK (mig 002:7), `app.platform_admins(user_id)` PK (mig 410:5), `d365_import_cache(org_id, code)` PK (mig 084:40).
- All 5 partial-predicate targets match their partial unique index verbatim: `outbox_events (org_id, dedup_key) where dedup_key is not null` (mig 102), `supplier_specs` one-active-approved (mig 162), `tenant_migrations` one-scheduled (mig 331), `factory_specs` one-approved-per-fg (mig 165), `scanner_audit_log` client_op replay (mig 414).
- All 7 `ON CONFLICT ON CONSTRAINT <name>` names exist: `demand_forecasts_org_item_week_unique`, `handoff_checklists_org_project_unique`, `mrp_requirements_run_item_bucket_unique`, `nutri_score_results_org_product_version_unique`, `nutrition_profiles_org_product_version_nutrient_unique` (dropped+re-added in same mig 110), `nutrition_allergens_org_product_allergen_unique` (mig 086), `reorder_thresholds_org_item_unique`.
- DROP INDEX/CONSTRAINT sweep: dropped uniques (`bom_headers_*` mig 363, `labor_rates_org_role_eff_unique` mig 446, `scanner_audit_log_org_client_op_id_uq` mig 415, `npd_projects_org_code_unique` mig 103) are **not** used as conflict targets by any app code; scanner code targets the replacement 414 index.

**View columns (app SQL refs vs latest migration definition):**
- `v_item_effective_cost` (mig 405): app uses only `org_id, item_id, amount, currency, source` across all 7 consumers (list-recipe-cost, list-portfolio-cost, get-item, load-recipe-cascade, save-draft, costing compute) — all exist.
- `missing_required_cols`, `dashboard_summary`, `launch_alerts` (mig 106): app column refs all match.
- `fa` view (mig 359, 81-col subset of product): **no app SQL reads from `fa` at all** — the 12 product cols it omits (volume, dev_code, weight, packs_per_case, benchmark, price_brief, comments, allergens_declaration_*) are only ever read via `product`, which has them.
- `product` view: all other alias-prefixed refs across 53 files, plus every `INSERT INTO product (…)` column list and `UPDATE product SET …` column, match the 93-col shape (INSTEAD-OF trigger surface intact). Only `p.name` (finding above) is phantom.
- `fa_allergen_cascade` (mig 391 redefinition — same 6 output cols as 359), `fa_status_overall` (359), `fa_bom_view` (133), `v_active_holds` (412), `v_inventory_available` (191; mig 282 is a data-fix, not a redefinition), `v_technical_revision_history` (229): all app refs clean, including bare-column single-view queries.
- No supabase-js `.from('<view>')` reads of any of these views exist.

## NOT covered
- Views/columns referenced only through **dynamic SQL** (e.g. `reference_tables` row_key-driven queries, `to_jsonb(p) ->> lower(dc.column_key)` in mig 106 — string keys fail silently to NULL, not 42703; `"Reference"."Suppliers"` has no static app reference).
- Live-DB drift: I verified migrations-as-written only; objects created/dropped manually on prod (khjvkhzwfzuwzrusgobp) outside `packages/db/migrations` are out of scope.
- Test-only SQL (`__tests__`, `*.test.ts`, `e2e/`, `tests/`) — excluded by instruction focus; their ON CONFLICT targets were not verified.
- `packages/db/seeds/*` ON CONFLICT targets (`Reference` schema seeds) — seeds, not app runtime.
- MV wrapper views (`v_mv_reporting_*`, `v_oee_*`, `oee_*`, `d365_import_cache_meta`): no app references found, so no column check performed.
- Column refs where the view is aliased inside deeply nested CTEs re-aliasing the same letter — regex-based alias resolution could miss exotic cases.