-- Wave 11 / N-28: post-359 built reset lived only in product_instead_of_update_fn; direct items
-- master edits (technical/items update-item.ts) bypassed reset for overlap/label columns projected
-- by the product view (name, gs1_gtin, tare_weight, shelf_life_days, list_price_gbp).
-- Wave0 lock: org_id; RLS via app.current_org_id().

create or replace function public.fa_reset_built_on_items_edit_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_built boolean;
begin
  if new.item_type <> 'fg' then
    return new;
  end if;

  if old.name is not distinct from new.name
     and old.gs1_gtin is not distinct from new.gs1_gtin
     and old.tare_weight is not distinct from new.tare_weight
     and old.shelf_life_days is not distinct from new.shelf_life_days
     and old.list_price_gbp is not distinct from new.list_price_gbp then
    return new;
  end if;

  select coalesce(x.built, false)
    into v_built
    from public.fg_npd_ext x
   where x.item_id = new.id
     and x.org_id = new.org_id;

  if v_built is true then
    perform public.fa_reset_product_built_for_edit(
      new.org_id,
      new.item_code,
      public.fa_actor_from_local_context(),
      'items',
      '{}'::jsonb
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.fa_reset_built_on_items_edit_fn() from public;

drop trigger if exists fa_reset_built_on_items_edit on public.items;
create trigger fa_reset_built_on_items_edit
  after update of name, gs1_gtin, tare_weight, shelf_life_days, list_price_gbp on public.items
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_reset_built_on_items_edit_fn();

comment on function public.fa_reset_built_on_items_edit_fn() is
  'Wave 11: reset built + emit fa.built_reset when FG items overlap/label columns change on a built product.';
