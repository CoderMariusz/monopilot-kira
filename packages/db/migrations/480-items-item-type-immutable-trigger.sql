-- Migration 480 — DB-enforced item_type freeze (Wave 15 fix / N-47).
--
-- Advisory lock per item serializes item_type updates vs typed-dependency creation.
-- Rejects item_type changes when the item is active or referenced.

create or replace function public.items_acquire_item_type_freeze_lock(p_item_id uuid)
returns void
language plpgsql
as $$
begin
  if p_item_id is not null then
    perform pg_advisory_xact_lock(
      hashtext('items:item_type_freeze'::text || '::' || p_item_id::text)
    );
  end if;
end;
$$;

create or replace function public.items_is_item_type_mutable(p_item_id uuid)
returns boolean
language sql
stable
as $$
  select not (
    exists (
      select 1
        from public.items item_row
       where item_row.id = p_item_id
         and item_row.org_id = app.current_org_id()
         and item_row.status = 'active'
    )
    or exists (
      select 1
        from public.bom_headers header
       where header.org_id = app.current_org_id()
         and header.item_id = p_item_id
         and header.status in ('draft', 'in_review', 'technical_approved', 'active')
    )
    or exists (
      select 1
        from public.bom_lines line
        join public.bom_headers header
          on header.id = line.bom_header_id
         and header.org_id = line.org_id
        join public.items item_row
          on item_row.id = p_item_id
         and item_row.org_id = app.current_org_id()
       where line.org_id = app.current_org_id()
         and header.status in ('draft', 'in_review', 'technical_approved', 'active')
         and (
           line.item_id = p_item_id
           or line.component_code = item_row.item_code
         )
    )
    or exists (
      select 1
        from public.factory_specs spec
       where spec.org_id = app.current_org_id()
         and spec.fg_item_id = p_item_id
         and spec.status <> 'archived'
    )
    or exists (
      select 1
        from public.work_orders wo
       where wo.org_id = app.current_org_id()
         and wo.product_id = p_item_id
    )
  );
$$;

create or replace function public.items_enforce_item_type_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.item_type is distinct from old.item_type then
    perform public.items_acquire_item_type_freeze_lock(new.id);
    if not public.items_is_item_type_mutable(new.id) then
      raise exception
        'item_type cannot change once the item is active or referenced by BOMs, factory specs, or work orders'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.items_lock_item_type_freeze_on_bom_header()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.items_acquire_item_type_freeze_lock(new.item_id);
  elsif new.item_id is distinct from old.item_id then
    perform public.items_acquire_item_type_freeze_lock(new.item_id);
    if old.item_id is not null then
      perform public.items_acquire_item_type_freeze_lock(old.item_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.items_lock_item_type_freeze_on_bom_line()
returns trigger
language plpgsql
as $$
declare
  v_item_id uuid;
begin
  v_item_id := new.item_id;
  if v_item_id is null and new.component_code is not null then
    select item_row.id
      into v_item_id
      from public.items item_row
     where item_row.org_id = app.current_org_id()
       and item_row.item_code = new.component_code
     limit 1;
  end if;
  perform public.items_acquire_item_type_freeze_lock(v_item_id);
  return new;
end;
$$;

create or replace function public.items_lock_item_type_freeze_on_factory_spec()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.items_acquire_item_type_freeze_lock(new.fg_item_id);
  elsif new.fg_item_id is distinct from old.fg_item_id then
    perform public.items_acquire_item_type_freeze_lock(new.fg_item_id);
    if old.fg_item_id is not null then
      perform public.items_acquire_item_type_freeze_lock(old.fg_item_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.items_lock_item_type_freeze_on_work_order()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.items_acquire_item_type_freeze_lock(new.product_id);
  elsif new.product_id is distinct from old.product_id then
    perform public.items_acquire_item_type_freeze_lock(new.product_id);
    if old.product_id is not null then
      perform public.items_acquire_item_type_freeze_lock(old.product_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists items_enforce_item_type_immutable on public.items;
create trigger items_enforce_item_type_immutable
  before update of item_type on public.items
  for each row
  execute function public.items_enforce_item_type_immutable();

drop trigger if exists bom_headers_lock_item_type_freeze on public.bom_headers;
create trigger bom_headers_lock_item_type_freeze
  before insert or update of item_id on public.bom_headers
  for each row
  execute function public.items_lock_item_type_freeze_on_bom_header();

drop trigger if exists bom_lines_lock_item_type_freeze on public.bom_lines;
create trigger bom_lines_lock_item_type_freeze
  before insert or update of item_id, component_code on public.bom_lines
  for each row
  execute function public.items_lock_item_type_freeze_on_bom_line();

drop trigger if exists factory_specs_lock_item_type_freeze on public.factory_specs;
create trigger factory_specs_lock_item_type_freeze
  before insert or update of fg_item_id on public.factory_specs
  for each row
  execute function public.items_lock_item_type_freeze_on_factory_spec();

drop trigger if exists work_orders_lock_item_type_freeze on public.work_orders;
create trigger work_orders_lock_item_type_freeze
  before insert or update of product_id on public.work_orders
  for each row
  execute function public.items_lock_item_type_freeze_on_work_order();

revoke all on function public.items_acquire_item_type_freeze_lock(uuid) from public;
grant execute on function public.items_acquire_item_type_freeze_lock(uuid) to app_user;
revoke all on function public.items_is_item_type_mutable(uuid) from public;
grant execute on function public.items_is_item_type_mutable(uuid) to app_user;
