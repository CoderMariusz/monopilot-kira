-- Migration 293: Wave R2 corrections foundation (storno/counter-entry framework).
-- Owner policy: posted production/warehouse ledger rows are immutable; corrections
-- are counter-entries with reason codes. org_id is the business scope (NOT tenant_id);
-- RLS continues through app.current_org_id().

-- Soft self-references only: corrected rows may be retained/imported independently
-- across ledger archival/export flows, so the service layer validates same-org origin
-- while the database avoids FK-induced retention/deletion coupling.
alter table public.wo_outputs
  add column if not exists correction_of_id uuid;

comment on column public.wo_outputs.correction_of_id is
  'Soft self-reference to the original wo_outputs row corrected by this counter-entry. No FK: ledger retention/export must not couple correction rows to source-row lifecycle.';

create index if not exists idx_wo_outputs_correction_of_id
  on public.wo_outputs (correction_of_id)
  where correction_of_id is not null;

alter table public.wo_waste_log
  add column if not exists correction_of_id uuid;

comment on column public.wo_waste_log.correction_of_id is
  'Soft self-reference to the original wo_waste_log row corrected by this counter-entry. No FK: ledger retention/export must not couple correction rows to source-row lifecycle.';

create index if not exists idx_wo_waste_log_correction_of_id
  on public.wo_waste_log (correction_of_id)
  where correction_of_id is not null;

-- Storno quantity decision:
-- Use signed counter rows for waste corrections. This keeps sum(qty_kg) exact and
-- auditable without teaching every downstream report a separate is_correction
-- semantic-negation flag. Non-correction waste remains strictly positive.
alter table public.wo_waste_log
  drop constraint if exists wo_waste_log_qty_kg_positive_check;

alter table public.wo_waste_log
  add constraint wo_waste_log_qty_kg_positive_check
  check (
    (correction_of_id is null and qty_kg > 0)
    or
    (correction_of_id is not null and qty_kg < 0)
  );

comment on constraint wo_waste_log_qty_kg_positive_check on public.wo_waste_log is
  'Original waste rows must be positive; correction rows are signed negative counter-entries so ledger sums naturally net out voided waste.';

create or replace function public.seed_correction_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Correction permissions are deliberately separate from write permissions.
  -- Admins get the full correction family; closed-WO corrections are a distinct
  -- tier also granted to production supervisors.
  v_admin_perms text[] := array[
    'production.output.correct',
    'production.consumption.correct',
    'production.waste.correct',
    'warehouse.receipt.correct',
    'production.corrections.closed_wo'
  ];
  v_supervisor_perms text[] := array[
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

revoke all on function public.seed_correction_permissions_for_org(uuid) from public;
revoke all on function public.seed_correction_permissions_for_org(uuid) from app_user;

create or replace function public.seed_correction_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_correction_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_correction_permissions_on_org_insert() from public;
revoke all on function public.seed_correction_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_correction_permissions on public.organizations;
create trigger trg_zzz_seed_correction_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_correction_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_correction_permissions_for_org(v_org_id);
  end loop;
end
$$;
