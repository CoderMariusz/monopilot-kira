-- Migration 391: NPD v2 slice S5c — allergen cascade reads npd_wip_processes (D6 process rebuild).
--
-- The process-added-allergen path historically read prod_detail.manufacturing_operation_1..4 via a
-- CROSS JOIN LATERAL (VALUES ...). NPD v2 moves processes to the dynamic public.npd_wip_processes
-- (mig 389). This migration repoints THREE places to read npd_wip_processes.process_name instead:
--   1. the live view public.fa_allergen_cascade  (process_confirmed / process_conditional CTEs)
--   2. the async rebuild fn app.queue_allergen_cascade_rebuild (5-arg) — affected_by_process CTE
--   3. NEW triggers on npd_wip_processes that refresh the stored allergen set on process changes
--      (mirroring the existing prod_detail.manufacturing_operation_N triggers).
--
-- The 4 manufacturing_operation columns + their prod_detail triggers are KEPT (additive cutover);
-- they can be dropped in a later migration after soak. Process-allergen data is currently empty in
-- BOTH sources, so the live cascade output is unchanged by this migration (verified by comparing the
-- rewritten view against the old one across products before apply). Only the rm/recipe CTEs + the
-- final SELECT are preserved byte-for-byte; only the 2 process CTEs change.

-- 1. View ---------------------------------------------------------------------------------------
create or replace view public.fa_allergen_cascade as
with rm_confirmed as (
  select p_1.product_code, p_1.org_id, rm.allergen_code
  from product p_1
    cross join lateral regexp_split_to_table(coalesce(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code)
    join "Reference"."Allergens_by_RM" rm
      on rm.org_id = p_1.org_id and rm.ingredient_codes = btrim(parsed.ingredient_code) and rm.confidence = 'confirmed'::text
  where btrim(parsed.ingredient_code) <> ''::text
), rm_may_contain as (
  select p_1.product_code, p_1.org_id, rm.allergen_code
  from product p_1
    cross join lateral regexp_split_to_table(coalesce(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code)
    join "Reference"."Allergens_by_RM" rm
      on rm.org_id = p_1.org_id and rm.ingredient_codes = btrim(parsed.ingredient_code) and (rm.confidence = any (array['may_contain'::text, 'trace'::text]))
  where btrim(parsed.ingredient_code) <> ''::text
), process_confirmed as (
  select distinct pd.product_code, pd.org_id, ap.allergen_code
  from prod_detail pd
    join public.npd_wip_processes wp on wp.prod_detail_id = pd.id and wp.org_id = pd.org_id
    join "Reference"."Allergens_added_by_Process" ap
      on ap.org_id = pd.org_id and ap.process_name = wp.process_name and ap.confidence = 'confirmed'::text
  where wp.process_name is not null
), process_conditional as (
  select distinct pd.product_code, pd.org_id, ap.allergen_code
  from prod_detail pd
    join public.npd_wip_processes wp on wp.prod_detail_id = pd.id and wp.org_id = pd.org_id
    join "Reference"."Allergens_added_by_Process" ap
      on ap.org_id = pd.org_id and ap.process_name = wp.process_name and ap.confidence = 'conditional'::text
  where wp.process_name is not null
), recipe_confirmed as (
  select f.product_code, f.org_id, btrim(a.allergen_code) as allergen_code
  from formulations f
    join lateral (
      select fv.id from formulation_versions fv
      where fv.formulation_id = f.id and fv.state <> 'draft'::text
      order by fv.version_number desc limit 1
    ) v on true
    join formulation_ingredients fi on fi.version_id = v.id
    cross join lateral unnest(coalesce(fi.allergens_inherited, '{}'::text[])) a(allergen_code)
  where btrim(coalesce(a.allergen_code, ''::text)) <> ''::text
), confirmed as (
  select rm_confirmed.product_code, rm_confirmed.org_id, rm_confirmed.allergen_code from rm_confirmed
  union
  select process_confirmed.product_code, process_confirmed.org_id, process_confirmed.allergen_code from process_confirmed
  union
  select recipe_confirmed.product_code, recipe_confirmed.org_id, recipe_confirmed.allergen_code from recipe_confirmed
), current_overrides as (
  select distinct on (o.org_id, o.product_code, o.allergen_code) o.product_code, o.org_id, o.allergen_code, o.action
  from fa_allergen_overrides o
  where o.superseded_at is null
  order by o.org_id, o.product_code, o.allergen_code, o.created_at desc, o.id desc
), published_candidates as (
  select confirmed.product_code, confirmed.org_id, confirmed.allergen_code from confirmed
  union
  select current_overrides.product_code, current_overrides.org_id, current_overrides.allergen_code
  from current_overrides where current_overrides.action = 'add'::fa_allergen_override_action
), published as (
  select pc.product_code, pc.org_id, pc.allergen_code
  from published_candidates pc
  where not (exists (
    select 1 from current_overrides co
    where co.org_id = pc.org_id and co.product_code = pc.product_code and co.allergen_code = pc.allergen_code
      and co.action = 'remove'::fa_allergen_override_action))
), may_contain_raw as (
  select rm_may_contain.product_code, rm_may_contain.org_id, rm_may_contain.allergen_code from rm_may_contain
  union
  select process_conditional.product_code, process_conditional.org_id, process_conditional.allergen_code from process_conditional
)
select product_code, org_id,
  coalesce((select array_agg(distinct c.allergen_code order by c.allergen_code) from confirmed c
    where c.product_code = p.product_code and c.org_id = p.org_id), '{}'::text[]) as derived_allergens,
  coalesce((select array_agg(distinct pub.allergen_code order by pub.allergen_code) from published pub
    where pub.product_code = p.product_code and pub.org_id = p.org_id), '{}'::text[]) as published_allergens,
  coalesce((select array_agg(distinct mc.allergen_code order by mc.allergen_code) from may_contain_raw mc
    where mc.product_code = p.product_code and mc.org_id = p.org_id and not (exists (
      select 1 from published pub2
      where pub2.org_id = mc.org_id and pub2.product_code = mc.product_code and pub2.allergen_code = mc.allergen_code))),
    '{}'::text[]) as may_contain_allergens,
  coalesce((select array_agg(distinct cp.allergen_code order by cp.allergen_code) from process_conditional cp
    where cp.product_code = p.product_code and cp.org_id = p.org_id), '{}'::text[]) as conditional_process_allergens
from product p;

-- 2. Async rebuild fn (5-arg) — affected_by_process now reads npd_wip_processes -----------------
create or replace function app.queue_allergen_cascade_rebuild(
  p_org_id uuid, p_ingredient_codes text[], p_process_names text[],
  p_source_event_id uuid default gen_random_uuid(),
  p_source_event_type text default 'reference.allergens_by_rm.bulk_changed'::text)
 returns table(product_code text, job_id uuid, source_event_id uuid, inserted boolean)
 language plpgsql security definer set search_path to 'pg_catalog'
as $function$
declare
  v_current_org_id uuid := app.current_org_id();
  v_run_after timestamptz := pg_catalog.now();
begin
  if v_current_org_id is null then
    raise exception 'queue_allergen_cascade_rebuild requires app.current_org_id()' using errcode = '28000';
  end if;
  if p_org_id is distinct from v_current_org_id then
    raise exception 'requested org % does not match current org context %', p_org_id, v_current_org_id using errcode = '42501';
  end if;
  if p_source_event_type not in ('reference.allergens_by_rm.bulk_changed', 'reference.allergens_added_by_process.bulk_changed') then
    raise exception 'unsupported allergen cascade source event type: %', p_source_event_type using errcode = '23514';
  end if;

  select coalesce(max(event.created_at), '-infinity'::timestamptz) + interval '5 minutes'
    into v_run_after
  from public.outbox_events event
  where event.org_id = p_org_id
    and event.event_type = 'npd.allergens.bulk_rebuild_completed'
    and event.created_at > pg_catalog.now() - interval '5 minutes';
  v_run_after := greatest(pg_catalog.now(), v_run_after);

  return query
  with normalized_ingredients as (
    select distinct pg_catalog.btrim(code) as ingredient_code
    from unnest(coalesce(p_ingredient_codes, '{}'::text[])) code
    where pg_catalog.btrim(code) <> ''
  ),
  normalized_processes as (
    select distinct pg_catalog.btrim(name) as process_name
    from unnest(coalesce(p_process_names, '{}'::text[])) name
    where pg_catalog.btrim(name) <> ''
  ),
  affected_by_rm as (
    select distinct product.product_code as affected_product_code
    from public.product
    cross join lateral pg_catalog.regexp_split_to_table(coalesce(product.ingredient_codes, ''), '\s*,\s*') parsed(ingredient_code)
    join normalized_ingredients changed on changed.ingredient_code = pg_catalog.btrim(parsed.ingredient_code)
    where product.org_id = p_org_id and product.deleted_at is null
  ),
  affected_by_process as (
    select distinct detail.product_code as affected_product_code
    from public.prod_detail detail
    join public.npd_wip_processes wp on wp.prod_detail_id = detail.id and wp.org_id = detail.org_id
    join normalized_processes changed on changed.process_name = wp.process_name
    join public.product product on product.product_code = detail.product_code and product.org_id = detail.org_id and product.deleted_at is null
    where detail.org_id = p_org_id
  ),
  affected as (
    select affected_by_rm.affected_product_code from affected_by_rm
    union
    select affected_by_process.affected_product_code from affected_by_process
  ),
  inserted_jobs as (
    insert into public.allergen_cascade_rebuild_jobs (org_id, product_code, source_event_id, source_event_type, run_after)
    select p_org_id, affected.affected_product_code, p_source_event_id, p_source_event_type, v_run_after
    from affected
    on conflict on constraint allergen_cascade_rebuild_jobs_dedup_unique do nothing
    returning allergen_cascade_rebuild_jobs.product_code, allergen_cascade_rebuild_jobs.id, allergen_cascade_rebuild_jobs.source_event_id
  )
  select affected.affected_product_code,
         coalesce(inserted_jobs.id, existing.id) as job_id,
         p_source_event_id as source_event_id,
         inserted_jobs.id is not null as inserted
  from affected
  left join inserted_jobs on inserted_jobs.product_code = affected.affected_product_code
  left join public.allergen_cascade_rebuild_jobs existing
    on existing.org_id = p_org_id and existing.product_code = affected.affected_product_code and existing.source_event_id = p_source_event_id
  order by affected.affected_product_code;
end;
$function$;

-- 3. Refresh the stored allergen set when a WIP process changes (mirror the prod_detail triggers).
create or replace function public.fa_refresh_allergen_set_for_wip_process_fn()
 returns trigger language plpgsql
as $function$
declare v_product_code text;
begin
  if app.current_org_id() is null then
    raise exception 'fa wip-process allergen auto-refresh requires an org context (app.current_org_id())';
  end if;
  if tg_op = 'DELETE' then
    select pd.product_code into v_product_code from public.prod_detail pd where pd.id = old.prod_detail_id;
    if v_product_code is not null then perform public.update_fa_allergen_set(v_product_code); end if;
    return old;
  end if;
  select pd.product_code into v_product_code from public.prod_detail pd where pd.id = new.prod_detail_id;
  if v_product_code is not null then perform public.update_fa_allergen_set(v_product_code); end if;
  return new;
end;
$function$;

drop trigger if exists fa_allergen_set_refresh_on_wip_process_insert on public.npd_wip_processes;
create trigger fa_allergen_set_refresh_on_wip_process_insert
  after insert on public.npd_wip_processes
  for each row when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_wip_process_fn();

drop trigger if exists fa_allergen_set_refresh_on_wip_process_update on public.npd_wip_processes;
create trigger fa_allergen_set_refresh_on_wip_process_update
  after update of process_name, prod_detail_id, org_id on public.npd_wip_processes
  for each row when (pg_trigger_depth() < 2
    and (old.process_name is distinct from new.process_name
      or old.prod_detail_id is distinct from new.prod_detail_id
      or old.org_id is distinct from new.org_id))
  execute function public.fa_refresh_allergen_set_for_wip_process_fn();

drop trigger if exists fa_allergen_set_refresh_on_wip_process_delete on public.npd_wip_processes;
create trigger fa_allergen_set_refresh_on_wip_process_delete
  after delete on public.npd_wip_processes
  for each row when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_wip_process_fn();
