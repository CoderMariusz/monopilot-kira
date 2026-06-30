-- 401-seed-default-warehouse-on-org-insert.sql
-- DB cleanup audit (owner decision: auto-seed default warehouse+location for new orgs).
-- A fresh org had no warehouse/location, so production output (LP create) failed with a
-- cryptic error. Seed a default MAIN warehouse + DEFAULT location on org insert (idempotent),
-- mirroring the mig-386 seed-on-org-insert pattern. The onboarding wizard's createFirstWarehouse
-- still works; this is a safety net (a user-created warehouse simply coexists). warehouse_type /
-- location_type have no CHECK constraints (verified), so 'main'/'bin' are accepted.
create or replace function public.seed_default_warehouse_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_wh uuid;
begin
  insert into public.warehouses (org_id, code, name, warehouse_type, is_default)
  values (p_org_id, 'MAIN', 'Main Warehouse', 'main', true)
  on conflict (org_id, code) do update set is_default = true
  returning id into v_wh;

  if v_wh is null then
    select id into v_wh from public.warehouses where org_id = p_org_id and code = 'MAIN';
  end if;

  insert into public.locations
    (org_id, warehouse_id, code, name, location_type, level, path)
  values
    (p_org_id, v_wh, 'DEFAULT', 'Default Location', 'bin', 1, 'MAIN/DEFAULT')
  on conflict (org_id, warehouse_id, code) do nothing;
end;
$fn$;

create or replace function public.seed_default_warehouse_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $trg$
begin
  perform public.seed_default_warehouse_for_org(new.id);
  return new;
end;
$trg$;

drop trigger if exists trg_seed_default_warehouse on public.organizations;
create trigger trg_seed_default_warehouse
  after insert on public.organizations
  for each row
  execute function public.seed_default_warehouse_on_org_insert();

-- Backfill orgs that currently have NO warehouse (idempotent; unblocks production for them).
do $bf$
declare v_org record;
begin
  for v_org in
    select o.id from public.organizations o
     where not exists (select 1 from public.warehouses w where w.org_id = o.id)
  loop
    perform public.seed_default_warehouse_for_org(v_org.id);
  end loop;
end $bf$;
