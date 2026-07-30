-- NSA-150: public.product is an INSTEAD-OF-triggered view over items + fg_npd_ext.
-- Since the mig-359 cut, its UPDATE trigger reported created_by_user rows as
-- updated without propagating that field to canonical items.created_by or the
-- product_legacy compatibility anchor. GDPR erasure therefore returned
-- product=3 while both backing copies of those personal-data FKs remained.
--
-- Forward-only repair:
--   1. preserve the latest mig-476 trigger behavior and add the missing
--      created_by_user mapping in items + product_legacy;
--   2. repair product rows belonging to subjects whose completed NPD erasure
--      audit proves they should already have been pseudonymised.

create or replace function public.product_instead_of_update_fn()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_org_id uuid := app.current_org_id();
  v_item_id uuid;
  v_actor uuid;
  v_effective_built boolean;
  v_non_built_changed boolean;
begin
  if v_org_id is null then
    raise exception 'product update requires an org context (app.current_org_id())';
  end if;

  select i.id into v_item_id
  from public.items i
  where i.org_id = v_org_id and i.item_code = old.product_code
  for update;
  if v_item_id is null then
    raise exception 'product update: % not found in current org', old.product_code;
  end if;

  -- Keep the mig-476 built transition guards.
  if new.built is distinct from old.built then
    if new.built is true and old.built is false then
      if exists (
        select 1 from public.risks risk
        where risk.org_id = v_org_id and risk.product_code = old.product_code
          and risk.bucket = 'High' and risk.state = 'Open'
      ) then
        raise exception 'V18_HIGH_RISK_OPEN' using errcode = '23514';
      end if;
    end if;
  end if;

  -- Keep reset-built-on-edit + its transactional outbox event.
  v_effective_built := new.built;
  v_non_built_changed := (to_jsonb(new) - 'built') is distinct from (to_jsonb(old) - 'built');
  if old.built is true and v_non_built_changed then
    v_effective_built := false;
    v_actor := public.fa_actor_from_local_context();
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values (
      v_org_id, 'fa.built_reset', 'fa', new.product_code,
      jsonb_build_object('org_id', v_org_id, 'product_code', new.product_code,
                         'actor_user_id', v_actor, 'source', 'product', 'diff', '{}'::jsonb),
      'update-fa-cell-reset-built-v2'
    );
  end if;

  -- items overlap columns. created_by is the NSA-150 repair; every other
  -- assignment is preserved from the latest function body (mig 476).
  update public.items i
     set item_code       = new.product_code,
         name            = coalesce(nullif(new.product_name, ''), i.name),
         gs1_gtin        = new.bar_codes,
         tare_weight     = new.tara_weight,
         shelf_life_days = public.fa_shelf_life_to_days(new.shelf_life),
         list_price_gbp  = new.price,
         status          = case when new.deleted_at is not null then 'deprecated'
                                when old.deleted_at is not null and new.deleted_at is null then 'active'
                                else i.status end,
         ext_jsonb       = coalesce(new.ext_jsonb, i.ext_jsonb),
         private_jsonb   = coalesce(new.private_jsonb, i.private_jsonb),
         schema_version  = coalesce(new.schema_version, i.schema_version),
         created_by      = new.created_by_user,
         updated_at      = now()
   where i.id = v_item_id
     and i.org_id = v_org_id;

  -- fg_npd_ext NPD + gap columns (built := effective value after reset logic).
  update public.fg_npd_ext x
     set pack_size = new.pack_size, number_of_cases = new.number_of_cases,
         recipe_components = new.recipe_components, ingredient_codes = new.ingredient_codes,
         template = new.template, primary_ingredient_pct = new.primary_ingredient_pct,
         runs_per_week = new.runs_per_week, date_code_per_week = new.date_code_per_week,
         launch_date = new.launch_date, department_number = new.department_number, article_number = new.article_number,
         cases_per_week_w1 = new.cases_per_week_w1, cases_per_week_w2 = new.cases_per_week_w2, cases_per_week_w3 = new.cases_per_week_w3,
         process_1 = new.process_1, yield_p1 = new.yield_p1, process_2 = new.process_2, yield_p2 = new.yield_p2,
         process_3 = new.process_3, yield_p3 = new.yield_p3, process_4 = new.process_4, yield_p4 = new.yield_p4,
         line = new.line, dieset = new.dieset, yield_line = new.yield_line, staffing = new.staffing, rate = new.rate,
         pr_code_p1 = new.pr_code_p1, pr_code_p2 = new.pr_code_p2, pr_code_p3 = new.pr_code_p3,
         pr_code_p4 = new.pr_code_p4, pr_code_final = new.pr_code_final,
         box = new.box, top_label = new.top_label, bottom_label = new.bottom_label, web = new.web,
         mrp_box = new.mrp_box, mrp_labels = new.mrp_labels, mrp_films = new.mrp_films,
         mrp_sleeves = new.mrp_sleeves, mrp_cartons = new.mrp_cartons,
         pallet_stacking_plan = new.pallet_stacking_plan, box_dimensions = new.box_dimensions,
         lead_time = new.lead_time, proc_shelf_life = new.proc_shelf_life,
         closed_core = new.closed_core, closed_planning = new.closed_planning, closed_commercial = new.closed_commercial,
         closed_production = new.closed_production, closed_technical = new.closed_technical,
         closed_mrp = new.closed_mrp, closed_procurement = new.closed_procurement,
         done_core = new.done_core, done_planning = new.done_planning, done_commercial = new.done_commercial,
         done_production = new.done_production, done_technical = new.done_technical,
         done_mrp = new.done_mrp, done_procurement = new.done_procurement,
         status_overall = new.status_overall, days_to_launch = new.days_to_launch,
         built = v_effective_built,
         volume = new.volume, dev_code = new.dev_code, weight = new.weight, packs_per_case = new.packs_per_case,
         benchmark = new.benchmark, price_brief = new.price_brief, comments = new.comments,
         allergens_declaration_accepted = coalesce(new.allergens_declaration_accepted, false),
         allergens_declaration_accepted_by = new.allergens_declaration_accepted_by,
         allergens_declaration_accepted_at = new.allergens_declaration_accepted_at,
         model_prediction_id = new.model_prediction_id, epcis_event_id = new.epcis_event_id, external_id = new.external_id,
         supplier = new.supplier, created_by_device = new.created_by_device, app_version = new.app_version,
         shelf_life = new.shelf_life,
         allergens = coalesce(new.allergens, x.allergens),
         may_contain = coalesce(new.may_contain, x.may_contain),
         deleted_at = new.deleted_at,
         updated_at = now()
   where x.item_id = v_item_id
     and x.org_id = v_org_id;

  update public.product_legacy pl
     set product_code = new.product_code,
         built = coalesce(v_effective_built, false),
         created_by_user = new.created_by_user
   where pl.org_id = v_org_id and pl.product_code = old.product_code;

  if pg_trigger_depth() < 2
     and (old.recipe_components is distinct from new.recipe_components
          or old.ingredient_codes is distinct from new.ingredient_codes) then
    perform public.update_fa_allergen_set(new.product_code);
  end if;

  new.built := v_effective_built;
  return new;
end;
$function$;

revoke all on function public.product_instead_of_update_fn() from public;

comment on function public.product_instead_of_update_fn() is
  'INSTEAD-OF UPDATE on public.product; mig 545 propagates created_by_user to items.created_by and product_legacy.created_by_user for GDPR erasure while preserving mig-476 built guards.';

-- One-time repair for erasures that completed while the broken trigger was
-- active. Scope strictly to product backing rows (items joined to fg_npd_ext),
-- the audited org, and the audited subject UUID.
with erased_subjects as materialized (
  select distinct ae.org_id, ae.resource_id::uuid as subject_user_id
    from public.audit_events ae
   where ae.resource_type = 'gdpr_erasure'
     and ae.action = 'gdpr.erasure_executed'
     and ae.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and ae.resource_id <> '00000000-0000-0000-0000-000000000000'
)
update public.items i
   set created_by = '00000000-0000-0000-0000-000000000000'::uuid,
       updated_at = now()
  from erased_subjects erased
 where i.org_id = erased.org_id
   and i.created_by = erased.subject_user_id
   and exists (
     select 1
       from public.fg_npd_ext x
      where x.org_id = i.org_id
        and x.item_id = i.id
   );

with erased_subjects as materialized (
  select distinct ae.org_id, ae.resource_id::uuid as subject_user_id
    from public.audit_events ae
   where ae.resource_type = 'gdpr_erasure'
     and ae.action = 'gdpr.erasure_executed'
     and ae.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and ae.resource_id <> '00000000-0000-0000-0000-000000000000'
)
update public.product_legacy pl
   set created_by_user = '00000000-0000-0000-0000-000000000000'::uuid
  from erased_subjects erased
 where pl.org_id = erased.org_id
   and pl.created_by_user = erased.subject_user_id;
