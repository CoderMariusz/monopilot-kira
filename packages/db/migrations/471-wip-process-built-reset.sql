-- Wave 11 / N-27: npd_wip_processes mutations refreshed allergens only (mig 391); no built reset.
-- Successor to manufacturing_operation_N edits (mig 223 prod_detail trigger). Mirror allergen
-- insert/update/delete trigger family; map wip process row → prod_detail → FG product_code.
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
     where pd.id = old.prod_detail_id;
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

  select pd.product_code, pd.org_id
    into v_product_code, v_org_id
    from public.prod_detail pd
   where pd.id = new.prod_detail_id;
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
    additional_cost, creates_wip_item, wip_item_id on public.npd_wip_processes
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
  'Wave 11: reset built + emit fa.built_reset when npd_wip_processes changes for a built FG.';
