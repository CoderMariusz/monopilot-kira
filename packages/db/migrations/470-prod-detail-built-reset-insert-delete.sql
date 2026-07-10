-- Wave 11 / N-26: fa_reset_built_on_prod_detail_edit was AFTER UPDATE ONLY; INSERT/DELETE
-- recipe components skipped built reset + fa.built_reset. Mirror mig 222 allergen insert/delete
-- coverage. Calls audited fa_reset_product_built_for_edit (mig 469 guard fix required).
-- Wave0 lock: org_id; RLS via app.current_org_id().

create or replace function public.fa_reset_built_on_prod_detail_insert_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  perform public.fa_reset_product_built_for_edit(
    new.org_id,
    new.product_code,
    public.fa_actor_from_local_context(),
    'prod_detail',
    '{}'::jsonb
  );
  return new;
end;
$function$;

create or replace function public.fa_reset_built_on_prod_detail_delete_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  perform public.fa_reset_product_built_for_edit(
    old.org_id,
    old.product_code,
    public.fa_actor_from_local_context(),
    'prod_detail',
    '{}'::jsonb
  );
  return old;
end;
$function$;

revoke all on function public.fa_reset_built_on_prod_detail_insert_fn() from public;
revoke all on function public.fa_reset_built_on_prod_detail_delete_fn() from public;

drop trigger if exists fa_reset_built_on_prod_detail_insert on public.prod_detail;
create trigger fa_reset_built_on_prod_detail_insert
  after insert on public.prod_detail
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_reset_built_on_prod_detail_insert_fn();

drop trigger if exists fa_reset_built_on_prod_detail_delete on public.prod_detail;
create trigger fa_reset_built_on_prod_detail_delete
  after delete on public.prod_detail
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_reset_built_on_prod_detail_delete_fn();

comment on function public.fa_reset_built_on_prod_detail_insert_fn() is
  'Wave 11: reset built + emit fa.built_reset when a prod_detail component is inserted on a built FG.';
comment on function public.fa_reset_built_on_prod_detail_delete_fn() is
  'Wave 11: reset built + emit fa.built_reset when a prod_detail component is deleted on a built FG.';
