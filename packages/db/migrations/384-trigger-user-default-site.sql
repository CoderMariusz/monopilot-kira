-- Migration 384 — per-user-site write-correctness: site_id triggers fall back to the user's assigned site.
--
-- mig 379/380 BEFORE INSERT triggers fill a NULL site_id from a natural source (production line / warehouse /
-- LP) then the ORG DEFAULT site. mig 383 added a RESTRICTIVE WITH CHECK = app.user_can_see_site(site_id). So a
-- RESTRICTED user (assigned to site A only) creating a row with NO natural source (e.g. a line-less WO, or a PO
-- without a destination warehouse) while on the "All sites" view would have site_id resolved to the ORG DEFAULT
-- site — which may not be theirs — and the WITH CHECK would BLOCK the insert. Now that app.current_user_id()
-- exists (mig 382), insert the user's own default assigned site into each trigger's coalesce, BEFORE the org
-- default. Natural source still wins (a row physically at site B stays site B → correctly blocked for an A-only
-- user); the user-default only applies when there is no natural source. Returns NULL for unrestricted /
-- 0-assignment users (→ unchanged org-default behaviour). No-op today (0 user_sites rows).

create or replace function app.user_default_site()
returns uuid
language sql
security definer
stable
set search_path = pg_catalog
as $$
  -- the current user's default assigned site: org-default-if-assigned else first assigned (active);
  -- NULL when the user has no assignments (caller then falls through to the org default).
  select coalesce(
    (select s.id
       from public.user_sites us
       join public.sites s on s.id = us.site_id and s.org_id = us.org_id
      where us.user_id = app.current_user_id()
        and us.org_id  = app.current_org_id()
        and s.is_active = true
        and s.is_default = true
      limit 1),
    (select s.id
       from public.user_sites us
       join public.sites s on s.id = us.site_id and s.org_id = us.org_id
      where us.user_id = app.current_user_id()
        and us.org_id  = app.current_org_id()
        and s.is_active = true
      order by s.is_default desc, s.id
      limit 1)
  )
$$;

revoke all on function app.user_default_site() from public;
grant execute on function app.user_default_site() to app_user;

-- ── work_orders: production line's site → user default → org default ──
create or replace function public.work_orders_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select pl.site_id from public.production_lines pl where pl.id = new.production_line_id and pl.org_id = new.org_id),
      app.user_default_site(),
      (select s.id from public.sites s where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;

-- ── purchase_orders: destination warehouse's site → user default → org default ──
create or replace function public.purchase_orders_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select w.site_id from public.warehouses w where w.id = new.destination_warehouse_id and w.org_id = new.org_id),
      app.user_default_site(),
      (select s.id from public.sites s where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;

-- ── grns: receiving warehouse's site → user default → org default ──
create or replace function public.grns_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select w.site_id from public.warehouses w where w.id = new.warehouse_id and w.org_id = new.org_id),
      app.user_default_site(),
      (select s.id from public.sites s where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;

-- ── stock_moves + lp_state_history (shared): moved LP's site → user default → org default ──
create or replace function public.set_site_id_from_lp()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select lp.site_id from public.license_plates lp where lp.id = new.lp_id and lp.org_id = new.org_id),
      app.user_default_site(),
      (select s.id from public.sites s where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;

-- ── quality_holds: referenced LP's site (lp-holds) → user default → org default ──
create or replace function public.quality_holds_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select lp.site_id from public.license_plates lp where lp.id = new.reference_id and lp.org_id = new.org_id and new.reference_type = 'lp'),
      app.user_default_site(),
      (select s.id from public.sites s where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;
