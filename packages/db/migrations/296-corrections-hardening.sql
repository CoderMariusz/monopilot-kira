-- Migration 296: Wave R2 review hardening for the corrections framework (migs 293-295).
--
-- F1a — Supervisor base-permission gap: mig 293 granted production supervisors ONLY
-- 'production.corrections.closed_wo', but assertCorrectionAllowed requires the BASE
-- correction permission FIRST (closed_wo is an additional tier, not a standalone
-- grant) — so the 293 supervisor grant was unusable on its own. Extend the seeder so
-- supervisors receive the base correction family too, then re-backfill every org.
-- Both stores stay in sync: normalized role_permissions + legacy roles.permissions jsonb.
--
-- F1b — Concurrency: the service layer pre-checks "already corrected" before inserting
-- a counter-entry, but two concurrent voids can both pass the pre-check. Enforce
-- one-correction-per-original at the database with unique partial indexes; the app
-- maps SQLSTATE 23505 on the counter INSERT to 'already_corrected'.
--
-- org_id is the business scope (NOT tenant_id); RLS continues through app.current_org_id().

create or replace function public.seed_correction_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Correction permissions are deliberately separate from write permissions.
  -- Admins get the full correction family. Supervisors now ALSO get the base
  -- family (296): the closed-WO tier alone is unusable because the framework
  -- checks the base permission first.
  v_admin_perms text[] := array[
    'production.output.correct',
    'production.consumption.correct',
    'production.waste.correct',
    'warehouse.receipt.correct',
    'production.corrections.closed_wo'
  ];
  v_supervisor_perms text[] := array[
    'production.output.correct',
    'production.consumption.correct',
    'production.waste.correct',
    'warehouse.receipt.correct',
    'production.corrections.closed_wo'
  ];
  -- Mirrors migration 185 role-family matching exactly.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  v_supervisor_roles text[] := array['supervisor','production_supervisor','shift_supervisor','production_lead'];
begin
  -- --- Normalized storage (role_permissions) ---
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_admin_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_supervisor_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles))
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_admin_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_supervisor_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles));
end;
$$;

-- CREATE OR REPLACE preserves existing grants, but re-assert the 293 lockdown
-- so this migration is safe to apply standalone.
revoke all on function public.seed_correction_permissions_for_org(uuid) from public;
revoke all on function public.seed_correction_permissions_for_org(uuid) from app_user;

-- Re-backfill every existing org with the widened supervisor grants
-- (same loop as 293; idempotent — ON CONFLICT DO NOTHING / distinct jsonb merge).
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_correction_permissions_for_org(v_org_id);
  end loop;
end
$$;

-- F1b: one correction per original, DB-enforced. Partial unique — original rows
-- (correction_of_id IS NULL) are unaffected; only counter-entries are constrained.
create unique index if not exists uq_wo_waste_log_one_correction
  on public.wo_waste_log (org_id, correction_of_id)
  where correction_of_id is not null;

comment on index public.uq_wo_waste_log_one_correction is
  'Wave R2 hardening (mig 296): at most one counter-entry per original waste row. Backstops the service-layer already-corrected pre-check under concurrent voids (app maps 23505 to already_corrected).';

create unique index if not exists uq_wo_outputs_one_correction
  on public.wo_outputs (org_id, correction_of_id)
  where correction_of_id is not null;

comment on index public.uq_wo_outputs_one_correction is
  'Wave R2 hardening (mig 296): at most one counter-entry per original output row. Backstops the service-layer already-corrected pre-check under concurrent voids (app maps 23505 to already_corrected).';
