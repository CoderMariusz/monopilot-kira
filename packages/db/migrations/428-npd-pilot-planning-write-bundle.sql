-- Migration 428: NPD PILOT Work Order backend bundle permission bridge.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- Pilot WO creation delegates to the canonical planning WO writer, which checks
-- npd.planning.write. Grant that permission to every role that already holds
-- npd.pilot.write, in BOTH role_permissions and the legacy roles.permissions
-- jsonb cache. No other permissions are touched. Re-entrant.

create or replace function public.grant_npd_pilot_planning_write_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Normalized storage: roles that hold npd.pilot.write get npd.planning.write.
  insert into public.role_permissions (role_id, permission)
  select distinct r.id, 'npd.planning.write'
    from public.roles r
   where r.org_id = p_org_id
     and (
       exists (
         select 1
           from public.role_permissions rp
          where rp.role_id = r.id
            and rp.permission = 'npd.pilot.write'
       )
       or coalesce(r.permissions, '[]'::jsonb) ? 'npd.pilot.write'
     )
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: union only npd.planning.write into the same role set.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
           from (
             select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
             union all
             select 'npd.planning.write'
           ) merged
       ),
       '["npd.planning.write"]'::jsonb
     )
   where r.org_id = p_org_id
     and (
       exists (
         select 1
           from public.role_permissions rp
          where rp.role_id = r.id
            and rp.permission = 'npd.pilot.write'
       )
       or coalesce(r.permissions, '[]'::jsonb) ? 'npd.pilot.write'
     );
end;
$$;

revoke all on function public.grant_npd_pilot_planning_write_for_org(uuid) from public;
revoke all on function public.grant_npd_pilot_planning_write_for_org(uuid) from app_user;

create or replace function public.grant_npd_pilot_planning_write_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.grant_npd_pilot_planning_write_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.grant_npd_pilot_planning_write_on_org_insert() from public;
revoke all on function public.grant_npd_pilot_planning_write_on_org_insert() from app_user;

-- Fire after the org-admin NPD seed trigger so roles already holding npd.pilot.write
-- receive the planning write bridge during new-org provisioning.
drop trigger if exists trg_zzzz_grant_npd_pilot_planning_write on public.organizations;
create trigger trg_zzzz_grant_npd_pilot_planning_write
  after insert on public.organizations
  for each row
  execute function public.grant_npd_pilot_planning_write_on_org_insert();

-- Backfill existing orgs.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.grant_npd_pilot_planning_write_for_org(v_org_id);
  end loop;
end
$$;
