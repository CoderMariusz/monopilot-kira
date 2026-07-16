-- Migration 498: C010 — production line warehouse site invariant.
-- Enforces warehouse.site_id IS NOT DISTINCT FROM production_lines.site_id at the DB
-- layer so split updates (line site vs warehouse site) cannot bypass the app guard.

create or replace function public.enforce_production_line_warehouse_site_match()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_wh_site_id uuid;
begin
  if new.warehouse_id is null then
    return new;
  end if;

  select w.site_id
    into v_wh_site_id
    from public.warehouses w
   where w.id = new.warehouse_id
     and w.org_id = new.org_id;

  if not found then
    raise exception 'invalid_warehouse_reference'
      using errcode = '23503';
  end if;

  if v_wh_site_id is distinct from new.site_id then
    raise exception 'warehouse_site_mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_production_line_warehouse_site_match() from public;
grant execute on function public.enforce_production_line_warehouse_site_match() to app_user;

drop trigger if exists production_line_warehouse_site_match on public.production_lines;
create trigger production_line_warehouse_site_match
  before insert or update of site_id, warehouse_id
  on public.production_lines
  for each row
  execute function public.enforce_production_line_warehouse_site_match();
