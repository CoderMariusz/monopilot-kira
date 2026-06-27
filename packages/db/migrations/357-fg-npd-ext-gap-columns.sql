-- Migration 357 — product→items MERGE, finalized-cut step 1 (§8d.1, additive + idempotent).
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md §8b "column-coverage gaps".
-- (Renumbered 355→357 for the supervised apply: live mig HEAD = 355, RBAC seed took 356.)
--
-- mig 353 created public.fg_npd_ext with the 75 NPD-only product columns, and mig 354 backfilled them.
-- BUT 7 product columns map to NEITHER an existing items column NOR a fg_npd_ext column. They must live
-- in fg_npd_ext so the P2 product VIEW (mig 359) can reproduce the EXACT 93-col product shape:
--   supplier, created_by_device, app_version, shelf_life text (§8f #5: raw text, view projects it verbatim),
--   allergens text[], may_contain text[], deleted_at timestamptz.
-- Rationale (§8b): deleted_at lives in ext to preserve the EXACT timestamp (items.status='deprecated'
-- is the production-lifecycle mirror, not a 1:1 of the timestamp); allergens/may_contain are the
-- regulatory FG declaration that update_fa_allergen_set persists (mig 358 re-routes them here).
--
-- This is additive (7 nullable/defaulted cols on an extension table only the merge reads) + an idempotent
-- backfill that UPDATEs the already-present ext rows (mig 354 inserted them WITHOUT these cols).
-- (§8f finding #5 adds shelf_life text here so the view projects raw text, not a narrowed int.)
-- Rollback: alter table public.fg_npd_ext drop column {supplier, created_by_device, app_version,
--           shelf_life, allergens, may_contain, deleted_at}.

-- 1. Add the 7 gap columns. Types mirror public.product EXACTLY; allergens/may_contain carry the same
--    NOT NULL DEFAULT '{}' contract product has (so the view never surfaces NULL arrays).
--    §8f finding #5: shelf_life is added here as RAW TEXT (product.shelf_life is text). The mig-359 view
--    projects shelf_life from THIS column verbatim — NOT from items.shelf_life_days::text — so an arbitrary
--    text value ("30 days", "TBD") round-trips exactly and never narrows/throws on write. The integer
--    items.shelf_life_days remains the best-effort PRODUCTION mirror (populated only when parseable).
alter table public.fg_npd_ext
  add column if not exists supplier          text,
  add column if not exists created_by_device text,
  add column if not exists app_version       text,
  add column if not exists shelf_life         text,
  add column if not exists allergens         text[] not null default '{}'::text[],
  add column if not exists may_contain       text[] not null default '{}'::text[],
  add column if not exists deleted_at        timestamptz;

-- 2. LIVE-DATA COMPLETENESS GATE (pre-359). The mig-359 product view is an INNER JOIN items ⨝ fg_npd_ext, so
--    any product that lacks an items twin AND/OR an fg_npd_ext row VANISHES from public.product after the cut.
--    mig 354 backfilled both, but ONLY for products that existed when it ran — products created later (e.g.
--    promoted NPD FGs FG-NPD-007/008/009) have no ext row (and 008 has no items twin). Re-run the P1 backfill
--    here, idempotently, so EVERY product has a complete twin before the cut. (Mirror of mig 354 (a)+(b), now
--    including the 7 gap cols added above; insert-where-not-exists / on-conflict-do-nothing → safe to re-run.)
insert into public.items (org_id, item_code, item_type, name, status, uom_base, origin_module, created_by)
select p.org_id, p.product_code, 'fg',
       coalesce(nullif(p.product_name, ''), p.product_code),
       case when p.deleted_at is not null then 'deprecated' else 'active' end,
       'kg', 'npd_backfill', p.created_by_user
from public.product p
where not exists (select 1 from public.items i where i.org_id = p.org_id and i.item_code = p.product_code)
on conflict (org_id, item_code) do nothing;

insert into public.fg_npd_ext (
  item_id, org_id,
  pack_size, number_of_cases, recipe_components, ingredient_codes, template, primary_ingredient_pct,
  runs_per_week, date_code_per_week, launch_date, department_number, article_number,
  cases_per_week_w1, cases_per_week_w2, cases_per_week_w3,
  process_1, yield_p1, process_2, yield_p2, process_3, yield_p3, process_4, yield_p4,
  line, dieset, yield_line, staffing, rate,
  pr_code_p1, pr_code_p2, pr_code_p3, pr_code_p4, pr_code_final,
  box, top_label, bottom_label, web, mrp_box, mrp_labels, mrp_films, mrp_sleeves, mrp_cartons,
  pallet_stacking_plan, box_dimensions, lead_time, proc_shelf_life,
  closed_core, closed_planning, closed_commercial, closed_production, closed_technical, closed_mrp, closed_procurement,
  done_core, done_planning, done_commercial, done_production, done_technical, done_mrp, done_procurement,
  status_overall, days_to_launch, built, volume, dev_code, weight, packs_per_case, benchmark, price_brief, comments,
  allergens_declaration_accepted, allergens_declaration_accepted_by, allergens_declaration_accepted_at,
  model_prediction_id, epcis_event_id, external_id,
  supplier, created_by_device, app_version, shelf_life, allergens, may_contain, deleted_at
)
select i.id, p.org_id,
  p.pack_size, p.number_of_cases, p.recipe_components, p.ingredient_codes, p.template, p.primary_ingredient_pct,
  p.runs_per_week, p.date_code_per_week, p.launch_date, p.department_number, p.article_number,
  p.cases_per_week_w1, p.cases_per_week_w2, p.cases_per_week_w3,
  p.process_1, p.yield_p1, p.process_2, p.yield_p2, p.process_3, p.yield_p3, p.process_4, p.yield_p4,
  p.line, p.dieset, p.yield_line, p.staffing, p.rate,
  p.pr_code_p1, p.pr_code_p2, p.pr_code_p3, p.pr_code_p4, p.pr_code_final,
  p.box, p.top_label, p.bottom_label, p.web, p.mrp_box, p.mrp_labels, p.mrp_films, p.mrp_sleeves, p.mrp_cartons,
  p.pallet_stacking_plan, p.box_dimensions, p.lead_time, p.proc_shelf_life,
  p.closed_core, p.closed_planning, p.closed_commercial, p.closed_production, p.closed_technical, p.closed_mrp, p.closed_procurement,
  p.done_core, p.done_planning, p.done_commercial, p.done_production, p.done_technical, p.done_mrp, p.done_procurement,
  p.status_overall, p.days_to_launch, p.built, p.volume, p.dev_code, p.weight, p.packs_per_case, p.benchmark, p.price_brief, p.comments,
  p.allergens_declaration_accepted, p.allergens_declaration_accepted_by, p.allergens_declaration_accepted_at,
  p.model_prediction_id, p.epcis_event_id, p.external_id,
  p.supplier, p.created_by_device, p.app_version, p.shelf_life,
  coalesce(p.allergens, '{}'::text[]), coalesce(p.may_contain, '{}'::text[]), p.deleted_at
from public.product p
join public.items i on i.org_id = p.org_id and i.item_code = p.product_code
on conflict (item_id) do nothing;

-- 3. Idempotent backfill of the 7 gap cols from public.product, keyed by the items twin (org_id + item_code =
--    product_code). Covers the pre-existing ext rows (mig 354 inserted them WITHOUT these cols).
--    mig 354 already created every ext row via INSERT … ON CONFLICT DO NOTHING, so the rows exist but the
--    7 new columns are NULL/default — fill them here. Re-runnable: it always overwrites from product
--    (product is still the source of truth until the mig-359 cut), so a second run is a no-op once equal.
update public.fg_npd_ext x
   set supplier          = p.supplier,
       created_by_device = p.created_by_device,
       app_version       = p.app_version,
       shelf_life        = p.shelf_life,
       allergens         = coalesce(p.allergens, '{}'::text[]),
       may_contain       = coalesce(p.may_contain, '{}'::text[]),
       deleted_at        = p.deleted_at,
       updated_at        = now()
  from public.items i
  join public.product p
    on p.org_id = i.org_id
   and p.product_code = i.item_code
 where x.item_id = i.id
   and (
        x.supplier          is distinct from p.supplier
     or x.created_by_device is distinct from p.created_by_device
     or x.app_version       is distinct from p.app_version
     or x.shelf_life        is distinct from p.shelf_life
     or x.allergens         is distinct from coalesce(p.allergens, '{}'::text[])
     or x.may_contain       is distinct from coalesce(p.may_contain, '{}'::text[])
     or x.deleted_at        is distinct from p.deleted_at
   );
