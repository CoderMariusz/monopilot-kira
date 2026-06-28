-- Migration 383 — P2+P3 of per-user-site RLS: the visibility helper + RESTRICTIVE policies.
--
-- Builds on mig 382 (app.current_user_id). app.user_can_see_site(site_id) is the single security predicate;
-- a RESTRICTIVE policy on each site-scoped table ANDs it with the existing PERMISSIVE org policy (org_id =
-- current_org_id) WITHOUT modifying that policy. Postgres: permissive policies are OR'd, then ALL restrictive
-- policies are AND'd — so effective read = (org match) AND (site visible).
--
-- ROLLOUT IS A NO-OP UNTIL ASSIGNMENTS EXIST: today every user has ZERO public.user_sites rows, so
-- user_can_see_site() returns true for every row via the zero-assignment condition (and also via the
-- null-current_user_id condition during the deploy window before mig-382's with-org-context change lands).
-- Enforcement activates ONLY once a sysadmin assigns sites (the settings assign-UI slice). Writes: the
-- BEFORE INSERT triggers (mig 379/380) populate site_id before WITH CHECK runs, so a restricted user's create
-- (active site = their site) passes and an admin/zero-assignment user always passes.

-- ── P2: the visibility predicate (SECURITY DEFINER so it reads user_roles/user_sites past their RLS) ──
create or replace function app.user_can_see_site(p_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select
    -- (1) no registered user (pre-mig-382 deploy window / test stub) → unrestricted
    app.current_user_id() is null
    -- (2) admin role (canonical admin slug family) → unrestricted
    or exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = app.current_user_id()
         and ur.org_id  = app.current_org_id()
         and r.slug = any(array['org.access.admin','org.platform.admin','owner','admin','org_admin'])
    )
    -- (3) zero site assignments → unrestricted (opt-in; every user today)
    or not exists (
      select 1
        from public.user_sites us
       where us.user_id = app.current_user_id()
         and us.org_id  = app.current_org_id()
    )
    -- (4) row has no site (orphan / pre-backfill) → visible (fail-open, not data loss)
    or p_site_id is null
    -- (5) user is assigned to this row's site
    or exists (
      select 1
        from public.user_sites us
       where us.user_id = app.current_user_id()
         and us.site_id = p_site_id
         and us.org_id  = app.current_org_id()
    )
$$;

revoke all on function app.user_can_see_site(uuid) from public;
grant execute on function app.user_can_see_site(uuid) to app_user;

-- Supporting index for condition (2): user_roles PK is (user_id, role_id); add (user_id, org_id) lookup.
create index if not exists user_roles_user_org_idx on public.user_roles (user_id, org_id);

-- ── P3: RESTRICTIVE site-visibility policy on every site-scoped table ──
-- (each already has exactly one PERMISSIVE org policy + RLS enabled — verified pre-migration)
do $$
declare t text;
begin
  foreach t in array array[
    'work_orders','purchase_orders','grns','stock_moves','lp_state_history',
    'quality_holds','quality_inspections','ncr_reports','shipments','schedule_outputs','license_plates'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_site_visibility', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to app_user '
      || 'using (app.user_can_see_site(site_id)) with check (app.user_can_see_site(site_id))',
      t || '_site_visibility', t
    );
  end loop;
end $$;
