-- Wave 11 / N-25: product_instead_of_update_fn keyed on session_user, which is unchanged
-- under SECURITY DEFINER — blocking the audited fa_reset_product_built_for_edit path when
-- session_user='app_user' (live app pool). Switch to current_user (definer for audited resets;
-- app_user for direct invocations that reach the guard). Preserve V18 messages + upgrade check.
-- Wave0 lock: org_id; RLS via app.current_org_id().

create or replace function public.product_instead_of_update_fn()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
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

  -- ── built transition guards (fa_built_v18_check) ──
  if new.built is distinct from old.built then
    -- current_user (NOT session_user): SECURITY DEFINER resets (fa_reset_product_built_for_edit,
    -- this fn) run as the definer/owner; direct app_user downgrades still raise here when they
    -- reach the INSTEAD-OF path. session_user stays the login role under SECURITY DEFINER and
    -- cannot distinguish audited vs raw downgrades (live: session_user='app_user').
    if new.built is false and old.built is true and current_user = 'app_user' then
      raise exception 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT' using errcode = '23514';
    end if;
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

  -- ── reset-built-on-edit (fa_reset_built_on_product_edit): if it was built and ANY non-built column
  --    changed, force built=false and emit fa.built_reset. Compare the 93-col image minus built. ──
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

  -- ── (a) items overlap columns ──
  update public.items i
     set item_code      = new.product_code,
         name           = coalesce(nullif(new.product_name, ''), i.name),
         gs1_gtin       = new.bar_codes,
         tare_weight    = new.tara_weight,
         shelf_life_days= public.fa_shelf_life_to_days(new.shelf_life),
         list_price_gbp = new.price,
         status         = case when new.deleted_at is not null then 'deprecated'
                               when old.deleted_at is not null and new.deleted_at is null then 'active'
                               else i.status end,
         ext_jsonb      = coalesce(new.ext_jsonb, i.ext_jsonb),
         private_jsonb  = coalesce(new.private_jsonb, i.private_jsonb),
         schema_version = coalesce(new.schema_version, i.schema_version),
         updated_at     = now()
   where i.id = v_item_id;

  -- ── (b) fg_npd_ext NPD + gap columns (built := effective value after reset logic) ──
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
   where x.item_id = v_item_id;

  update public.product_legacy pl
     set product_code = new.product_code, built = coalesce(v_effective_built, false)
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
