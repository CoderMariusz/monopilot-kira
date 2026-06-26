-- Migration 354 — product→items MERGE, Phase P1 (additive, idempotent backfill).
-- (a) Orphan products with no items twin → create an fg items row (origin_module='npd_backfill').
-- (b) Every product → insert its fg_npd_ext row (the NPD-only columns) keyed by the items twin.
-- NO writes to public.product. Point-in-time backfill; P3's INSTEAD-OF triggers keep them in sync after.
-- Test env: 1 product (FG-NPD-002) which already HAS its items twin → only (b) fires (1 ext row).
-- Rollback: delete from public.fg_npd_ext; delete from public.items where origin_module='npd_backfill'.
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md (P1).

-- (a) orphan items (required no-default cols: org_id,item_code,item_type,name,uom_base)
insert into public.items (org_id, item_code, item_type, name, status, uom_base, origin_module, created_by)
select p.org_id, p.product_code, 'fg',
       coalesce(nullif(p.product_name, ''), p.product_code),
       case when p.deleted_at is not null then 'deprecated' else 'active' end,
       'kg', 'npd_backfill', p.created_by_user
from public.product p
where not exists (select 1 from public.items i where i.org_id = p.org_id and i.item_code = p.product_code)
on conflict (org_id, item_code) do nothing;

-- (b) ext backfill — fg_npd_ext column names match product 1:1, so this is a clean copy.
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
  model_prediction_id, epcis_event_id, external_id
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
  p.model_prediction_id, p.epcis_event_id, p.external_id
from public.product p
join public.items i on i.org_id = p.org_id and i.item_code = p.product_code
on conflict (item_id) do nothing;
