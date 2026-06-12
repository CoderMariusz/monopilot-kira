-- ===========================================================================
-- 292 — fin.* RBAC grant catch-up (fin.costs.read + 3 sibling strings).
--
--   ROOT CAUSE (live /finance permissionDenied for the org admin, Gate E2E
--   2026-06-12): the 2026-06-09 "minimal sitemap RBAC" audit added FOUR new
--   strings to packages/rbac/src/permissions.enum.ts —
--     fin.costs.read, fin.costs.manage, fin.valuation.read, fin.variance.read
--   — and the finance WO-cost page + module-registry nav gate on
--   `fin.costs.read`, but NO migration ever seeded them. Migration 199 seeded
--   only the original 14-string fin.* family, so on live the admin role
--   (org.access.admin) has fin.actual_cost.view etc. yet `fin.costs.read` is
--   absent from BOTH role_permissions and the legacy roles.permissions jsonb
--   → listCompletedWoCosts() returns forbidden → permissionDenied banner.
--
--   FIX (same class as 116/146/148/149/154/185/192/199/202): redefine the 199
--   seeder with the COMPLETE 18-string fin.* family (admin role family) and
--   the read subset for the finance operator/analyst family, in BOTH
--   role_permissions (normalized) AND roles.permissions (legacy jsonb cache),
--   then re-backfill every existing org. The 199 trigger
--   (trg_zzz_seed_finance_permissions on public.organizations) calls this
--   function by name, so new orgs inherit the extended set automatically.
--
--   Idempotent: inserts are ON CONFLICT DO NOTHING; jsonb merge is a distinct
--   union. Re-running this migration is a no-op.
-- ===========================================================================

create or replace function public.seed_finance_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete fin.* family. Mirrors packages/rbac/src/permissions.enum.ts
  -- (14 strings from 199 + the 4 strings of the 2026-06-09 sitemap audit).
  v_all_perms text[] := array[
    'fin.settings.view',
    'fin.settings.edit',
    'fin.standard_cost.view',
    'fin.standard_cost.edit',
    'fin.standard_cost.approve',
    'fin.actual_cost.view',
    'fin.costs.read',
    'fin.costs.manage',
    'fin.valuation.read',
    'fin.valuation.view',
    'fin.valuation.close',
    'fin.variance.read',
    'fin.variance.view',
    'fin.variance.finalize',
    'fin.dashboard.view',
    'fin.reports.view',
    'fin.d365.view',
    'fin.d365_dlq.replay'
  ];
  -- Finance operator/analyst subset: reads everything + drafts standard costs +
  -- reads D365 export. NOT the elevated/SoD strings (standard_cost.approve,
  -- valuation.close, variance.finalize, d365_dlq.replay, settings.edit,
  -- fin.costs.manage) — those stay admin-only.
  v_operator_perms text[] := array[
    'fin.settings.view',
    'fin.standard_cost.view',
    'fin.standard_cost.edit',
    'fin.actual_cost.view',
    'fin.costs.read',
    'fin.valuation.read',
    'fin.valuation.view',
    'fin.variance.read',
    'fin.variance.view',
    'fin.dashboard.view',
    'fin.reports.view',
    'fin.d365.view'
  ];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  v_operator_roles text[] := array[
    'finance_operator','finance_analyst','finance_clerk','finance','controller','cost_accountant'
  ];
begin
  -- --- Normalized storage (role_permissions) ---
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_operator_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_all_perms)
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
           select unnest(v_operator_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles));
end;
$$;

revoke all on function public.seed_finance_permissions_for_org(uuid) from public;
revoke all on function public.seed_finance_permissions_for_org(uuid) from app_user;

-- Backfill every existing org with the extended set.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_finance_permissions_for_org(v_org_id);
  end loop;
end
$$;
