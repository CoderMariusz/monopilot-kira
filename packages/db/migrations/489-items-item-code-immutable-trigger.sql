-- Migration 489 — DB-enforced item_code freeze (Wave D365-identity).
--
-- item_code is immutable when the item is a linked FG (fg_npd_ext) OR referenced
-- per migration-480 (items_is_item_type_mutable). Does NOT modify migration 480.

create or replace function public.items_is_item_code_mutable(p_item_id uuid)
returns boolean
language sql
stable
as $$
  select
    not exists (
      select 1
        from public.fg_npd_ext x
       where x.item_id = p_item_id
    )
    and public.items_is_item_type_mutable(p_item_id);
$$;

create or replace function public.items_enforce_item_code_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.item_code is distinct from old.item_code then
    perform public.items_acquire_item_type_freeze_lock(new.id);
    if not public.items_is_item_code_mutable(new.id) then
      raise exception
        'items.item_code is immutable for a linked FG or referenced item'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_enforce_item_code_immutable on public.items;
create trigger items_enforce_item_code_immutable
  before update of item_code on public.items
  for each row
  execute function public.items_enforce_item_code_immutable();

revoke all on function public.items_is_item_code_mutable(uuid) from public;
grant execute on function public.items_is_item_code_mutable(uuid) to app_user;

revoke all on function public.items_enforce_item_code_immutable() from public;
grant execute on function public.items_enforce_item_code_immutable() to app_user;
