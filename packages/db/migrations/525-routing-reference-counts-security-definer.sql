-- 525-routing-reference-counts-security-definer.sql
-- R-6 (Fala 4 / FIX-ROUTING): the routing delete guard could MISS a work order.
--
-- deleteRouting refuses when anything still points at the version. Both pointers
-- are soft (no FK): work_orders.routing_id and technical_change_order_lines
-- (target_type='routing', target_id). The guard counted them with a plain
-- subquery running as `app_user` — and migration 383 put a RESTRICTIVE policy
-- `work_orders_site_visibility` on work_orders, so a user only sees work orders
-- of the sites assigned to them. public.routings carries org-level RLS only.
--
-- Net effect: a user assigned to site A could see (and delete) a draft routing
-- while a work order in site B referenced it. The guard counted 0, the delete
-- succeeded, and the work order was left holding an id that resolves to nothing.
--
-- Fix: count through this SECURITY DEFINER function. It runs as the owner, so
-- site visibility cannot hide a reference from the guard, while the ONLY tenant
-- input is app.current_org_id() — read from the session GUC, never a parameter —
-- and every branch filters org_id hard. A caller therefore cannot count, probe or
-- leak anything outside their own org: the function returns counts, never rows.
--
-- SECURITY DEFINER without an explicit search_path is a privilege-escalation
-- vector (a caller-controlled search_path can shadow `public.work_orders`), so it
-- is pinned below and every object is schema-qualified anyway.
--
-- Dependency worth stating out loud: public.work_orders is FORCE ROW LEVEL
-- SECURITY and every policy on it is granted `to app_user`, so the definer role
-- must bypass RLS (superuser or BYPASSRLS) or this function would see zero rows
-- and count 0 for everything — a guard that silently passes every routing. That
-- is the same bet app.user_can_see_site (migration 383) already makes when it
-- reads FORCE-RLS public.user_sites. The post-check below asserts it instead of
-- assuming it, so a role without the privilege fails the migration gate rather
-- than shipping a guard that always says "no references".

create or replace function public.routing_reference_counts(p_routing_id uuid)
returns table (work_order_count integer, change_order_line_count integer)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select
    (select count(*)::integer
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.routing_id = p_routing_id),
    (select count(*)::integer
       from public.technical_change_order_lines ecol
      where ecol.org_id = app.current_org_id()
        and ecol.target_type = 'routing'
        and ecol.target_id = p_routing_id);
$$;

comment on function public.routing_reference_counts(uuid) is
  'R-6: soft-reference count for a routing version (work_orders + ECO lines). SECURITY DEFINER so per-site RLS cannot hide a reference from the delete guard; org scope comes only from app.current_org_id().';

revoke all on function public.routing_reference_counts(uuid) from public;
grant execute on function public.routing_reference_counts(uuid) to app_user;

-- Post-check: CALL the function. `create function` only parses the body, and a
-- catalog assertion would pass on a function that cannot execute at all (a
-- missing column, a search_path that hides work_orders). A random uuid belongs to
-- nobody, so both counts must come back as exactly 0 — and getting a row back at
-- all is the proof that the body runs.
do $$
declare
  v_wo integer;
  v_eco integer;
  v_secdef boolean;
  v_config text[];
  v_bypasses_rls boolean;
begin
  select r.rolsuper or r.rolbypassrls
    into v_bypasses_rls
    from pg_catalog.pg_roles r
   where r.rolname = current_user;

  if v_bypasses_rls is not true then
    raise exception 'migration 525 FAILED: definer role % is neither superuser nor BYPASSRLS; public.work_orders is FORCE ROW LEVEL SECURITY with policies granted only to app_user, so routing_reference_counts would count 0 for every routing and the delete guard would let a referenced routing through', current_user;
  end if;

  select r.work_order_count, r.change_order_line_count
    into v_wo, v_eco
    from public.routing_reference_counts(gen_random_uuid()) r;

  if v_wo is distinct from 0 or v_eco is distinct from 0 then
    raise exception 'migration 525 FAILED: reference counts for an unknown routing are (%, %), expected (0, 0)', v_wo, v_eco;
  end if;

  select p.prosecdef, p.proconfig
    into v_secdef, v_config
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'routing_reference_counts';

  if v_secdef is not true then
    raise exception 'migration 525 FAILED: routing_reference_counts must be SECURITY DEFINER';
  end if;
  if v_config is null or not (v_config::text like '%search_path=%') then
    raise exception 'migration 525 FAILED: routing_reference_counts must pin search_path';
  end if;

  raise notice 'migration 525: routing_reference_counts executes, is SECURITY DEFINER and pins search_path';
end
$$;
