-- Migration 551 — per-user site visibility for production facts.
--
-- Order matters: migration 550 repairs/stamps site_id before these RESTRICTIVE
-- policies can hide rows. Existing permissive org policies remain unchanged.

drop policy if exists wo_outputs_site_visibility on public.wo_outputs;
create policy wo_outputs_site_visibility
  on public.wo_outputs
  as restrictive
  for all
  to app_user
  using (app.user_can_see_site(site_id))
  with check (app.user_can_see_site(site_id));

drop policy if exists wo_events_site_visibility on public.wo_events;
create policy wo_events_site_visibility
  on public.wo_events
  as restrictive
  for all
  to app_user
  using (app.user_can_see_site(site_id))
  with check (app.user_can_see_site(site_id));

drop policy if exists downtime_events_site_visibility on public.downtime_events;
create policy downtime_events_site_visibility
  on public.downtime_events
  as restrictive
  for all
  to app_user
  using (app.user_can_see_site(site_id))
  with check (app.user_can_see_site(site_id));

-- Before changing the global helper, prove that every table already protected
-- by a RESTRICTIVE user_can_see_site(site_id) policy has zero NULL site rows.
-- A non-zero count is a producer/backfill gap, never legal cross-site semantics.
do $$
declare
  v_table record;
  v_null_count bigint;
  v_total_null bigint := 0;
begin
  for v_table in
    select distinct policies.tablename
      from pg_catalog.pg_policies policies
     where policies.schemaname = 'public'
       and lower(policies.permissive) = 'restrictive'
       and (
         coalesce(policies.qual, '') ilike '%user_can_see_site(site_id)%'
         or coalesce(policies.with_check, '') ilike '%user_can_see_site(site_id)%'
       )
     order by policies.tablename
  loop
    execute format(
      'select count(*) from public.%I where site_id is null',
      v_table.tablename
    ) into v_null_count;
    v_total_null := v_total_null + v_null_count;
    raise notice
      'migration 551 NULL audit: table=% site_id_null=%',
      v_table.tablename, v_null_count;
  end loop;

  if v_total_null > 0 then
    raise exception
      'migration 551 refuses fail-closed flip: % site-scoped rows still have NULL site_id; repair their producers/backfill first',
      v_total_null;
  end if;
end
$$;

-- site_id=NULL is not a legal visibility scope. Keep the existing admin and
-- zero-assignment rollout branches for real sites, but reject NULL before any
-- unrestricted branch is evaluated.
create or replace function app.user_can_see_site(p_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select p_site_id is not null
    and (
      app.current_user_id() is null
      or exists (
        select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
         where ur.user_id = app.current_user_id()
           and ur.org_id  = app.current_org_id()
           and r.slug = any(array[
             'org.access.admin',
             'org.platform.admin',
             'owner',
             'admin',
             'org_admin'
           ])
      )
      or not exists (
        select 1
          from public.user_sites us
         where us.user_id = app.current_user_id()
           and us.org_id  = app.current_org_id()
      )
      or exists (
        select 1
          from public.user_sites us
         where us.user_id = app.current_user_id()
           and us.site_id = p_site_id
           and us.org_id  = app.current_org_id()
      )
    )
$$;

revoke all on function app.user_can_see_site(uuid) from public;
grant execute on function app.user_can_see_site(uuid) to app_user;

comment on function app.user_can_see_site(uuid) is
  'Site visibility predicate for RESTRICTIVE RLS policies. site_id NULL is '
  'always denied: NULL on a site-scoped operational row is a producer/backfill '
  'gap, not cross-site semantics. For non-NULL sites, admin roles and users '
  'without assignments retain the staged all-site rollout behavior; assigned '
  'users see only rows in public.user_sites.';

do $$
declare
  v_policy_count integer;
begin
  select count(*)
    into v_policy_count
    from pg_catalog.pg_policies policies
   where policies.schemaname = 'public'
     and policies.tablename = any(array['wo_outputs', 'wo_events', 'downtime_events'])
     and policies.policyname = policies.tablename || '_site_visibility'
     and lower(policies.permissive) = 'restrictive'
     and policies.cmd = 'ALL';

  if v_policy_count <> 3 then
    raise exception
      'migration 551 post-check failed: expected 3 RESTRICTIVE FOR ALL policies, found %',
      v_policy_count;
  end if;
  if app.user_can_see_site(null) then
    raise exception
      'migration 551 post-check failed: app.user_can_see_site(NULL) is still fail-open';
  end if;

  raise notice
    'migration 551 post-check: restrictive_policies=%, user_can_see_site_null=false',
    v_policy_count;
end
$$;
