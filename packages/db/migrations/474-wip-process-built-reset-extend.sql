-- Wave 11 fix round 1 / N-27: extend npd_wip_processes built-reset UPDATE coverage to all
-- built-relevant columns (migs 429/430/436/450) and reset BOTH old and new FG parents on
-- prod_detail_id/org_id reassignment with org-qualified prod_detail lookups.
-- Wave0 lock: org_id; RLS via app.current_org_id().

create or replace function public.fa_reset_built_on_wip_process_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_product_code text;
  v_org_id uuid;
begin
  if app.current_org_id() is null then
    raise exception 'fa wip-process built reset requires an org context (app.current_org_id())';
  end if;

  if tg_op = 'DELETE' then
    select pd.product_code, pd.org_id
      into v_product_code, v_org_id
      from public.prod_detail pd
     where pd.id = old.prod_detail_id
       and pd.org_id = old.org_id;
    if v_product_code is not null then
      perform public.fa_reset_product_built_for_edit(
        v_org_id,
        v_product_code,
        public.fa_actor_from_local_context(),
        'npd_wip_processes',
        '{}'::jsonb
      );
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.prod_detail_id is distinct from new.prod_detail_id
          or old.org_id is distinct from new.org_id) then
    select pd.product_code, pd.org_id
      into v_product_code, v_org_id
      from public.prod_detail pd
     where pd.id = old.prod_detail_id
       and pd.org_id = old.org_id;
    if v_product_code is not null then
      perform public.fa_reset_product_built_for_edit(
        v_org_id,
        v_product_code,
        public.fa_actor_from_local_context(),
        'npd_wip_processes',
        '{}'::jsonb
      );
    end if;
  end if;

  select pd.product_code, pd.org_id
    into v_product_code, v_org_id
    from public.prod_detail pd
   where pd.id = new.prod_detail_id
     and pd.org_id = new.org_id;
  if v_product_code is not null then
    perform public.fa_reset_product_built_for_edit(
      v_org_id,
      v_product_code,
      public.fa_actor_from_local_context(),
      'npd_wip_processes',
      '{}'::jsonb
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.fa_reset_built_on_wip_process_fn() from public;

drop trigger if exists fa_reset_built_on_wip_process_insert on public.npd_wip_processes;
create trigger fa_reset_built_on_wip_process_insert
  after insert on public.npd_wip_processes
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_reset_built_on_wip_process_fn();

drop trigger if exists fa_reset_built_on_wip_process_update on public.npd_wip_processes;
create trigger fa_reset_built_on_wip_process_update
  after update of process_name, prod_detail_id, org_id, display_order, duration_hours,
    additional_cost, creates_wip_item, wip_item_id, throughput_per_hour, throughput_uom,
    setup_cost, wip_definition_id, yield_pct, line_id on public.npd_wip_processes
  for each row
  when (
    pg_trigger_depth() < 2
    and (
      old.process_name is distinct from new.process_name
      or old.prod_detail_id is distinct from new.prod_detail_id
      or old.org_id is distinct from new.org_id
      or old.display_order is distinct from new.display_order
      or old.duration_hours is distinct from new.duration_hours
      or old.additional_cost is distinct from new.additional_cost
      or old.creates_wip_item is distinct from new.creates_wip_item
      or old.wip_item_id is distinct from new.wip_item_id
      or old.throughput_per_hour is distinct from new.throughput_per_hour
      or old.throughput_uom is distinct from new.throughput_uom
      or old.setup_cost is distinct from new.setup_cost
      or old.wip_definition_id is distinct from new.wip_definition_id
      or old.yield_pct is distinct from new.yield_pct
      or old.line_id is distinct from new.line_id
    )
  )
  execute function public.fa_reset_built_on_wip_process_fn();

drop trigger if exists fa_reset_built_on_wip_process_delete on public.npd_wip_processes;
create trigger fa_reset_built_on_wip_process_delete
  after delete on public.npd_wip_processes
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_reset_built_on_wip_process_fn();

comment on function public.fa_reset_built_on_wip_process_fn() is
  'Wave 11 fix: reset built + emit fa.built_reset on npd_wip_processes changes; reassignment resets both parents.';
