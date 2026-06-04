-- Migration 115: T-089 — NPD GDPR right-to-erasure (Art. 17).
-- PRD: docs/prd/01-NPD-PRD.md §15 Compliance + Foundation §15 GDPR.
-- Wave0 lock: org_id business scope (NOT tenant_id); org-scoping via app.current_org_id().
--
-- Ships:
--   1. A global anonymisation SENTINEL user (id 00000000-0000-0000-0000-000000000000)
--      that NOT-NULL user-FK columns are repointed to (pseudonymise, never delete,
--      never break FK integrity). It lives in a dedicated system tenant/org/role so
--      it is invisible to every real org under RLS but resolvable by the NOT-NULL FKs.
--   2. public.gdpr_redact_user_pii(target_user_id uuid) RETURNS jsonb — a SECURITY
--      DEFINER function that pseudonymises every NPD actor reference for the subject
--      WITHIN the active org context (app.current_org_id()), writes a
--      'gdpr.erasure_executed' audit_events row (target_user_id + per-table counts,
--      retention_class='security'), and returns the counts jsonb.
--
-- This SQL function is also the body of the foundation @monopilot/gdpr NPD erasure
-- handler (packages/db/src/erasure/npd.ts), so the centralized runErasure() dispatch
-- path (foundation T-113/T-114) drives the exact same logic.
--
-- Red lines honoured:
--   - Pseudonymise, never DELETE business rows (FK + audit integrity preserved).
--   - Always emits the gdpr.erasure_executed audit row.
--   - SECURITY DEFINER (service-role scoped), never INVOKER.
--   - Org-scoped: only rows where org_id = app.current_org_id() are touched.

-- ---------------------------------------------------------------------------
-- 1. Anonymisation sentinel (system tenant/org/role/user) — idempotent.
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name, region_cluster, data_plane_url)
values (
  '00000000-0000-0000-0000-0000000000ff',
  'GDPR System (anonymisation sentinel)',
  'eu',
  'system://gdpr-sentinel'
)
on conflict (id) do nothing;

insert into public.organizations (id, tenant_id, name, industry_code)
values (
  '00000000-0000-0000-0000-0000000000ee',
  '00000000-0000-0000-0000-0000000000ff',
  'GDPR System Org (anonymisation sentinel)',
  'generic'
)
on conflict (id) do nothing;

insert into public.roles (id, org_id, code, name, permissions, is_system)
values (
  '00000000-0000-0000-0000-0000000000dd',
  '00000000-0000-0000-0000-0000000000ee',
  'gdpr_sentinel',
  'GDPR Anonymised',
  '[]'::jsonb,
  true
)
on conflict (id) do nothing;

insert into public.users (id, org_id, email, name, role_id, is_active)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000ee',
  'gdpr-anonymised@system.invalid',
  '[anonymised]',
  '00000000-0000-0000-0000-0000000000dd',
  false
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The erasure function.
-- ---------------------------------------------------------------------------
create or replace function public.gdpr_redact_user_pii(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_org_id        uuid := app.current_org_id();
  v_placeholder   constant uuid := '00000000-0000-0000-0000-000000000000';
  v_counts        jsonb := '{}'::jsonb;
  v_n             integer;
begin
  if v_org_id is null then
    raise exception 'gdpr_redact_user_pii: no org context set (app.current_org_id() is null)'
      using errcode = '42501';
  end if;

  -- Never let a caller "erase" the sentinel itself.
  if target_user_id = v_placeholder then
    raise exception 'gdpr_redact_user_pii: refusing to redact the anonymisation sentinel';
  end if;

  -- product (the "fa" compatibility view's backing table)
  update public.product
     set created_by_user = v_placeholder
   where org_id = v_org_id and created_by_user = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('product', v_n, 'fa', v_n);

  -- brief
  update public.brief
     set created_by_user   = case when created_by_user   = target_user_id then v_placeholder else created_by_user end,
         converted_by_user = case when converted_by_user = target_user_id then v_placeholder else converted_by_user end
   where org_id = v_org_id
     and (created_by_user = target_user_id or converted_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('brief', v_n);

  -- npd_projects
  update public.npd_projects
     set created_by_user = v_placeholder
   where org_id = v_org_id and created_by_user = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('npd_projects', v_n);

  -- gate_checklist_items
  update public.gate_checklist_items
     set completed_by_user = v_placeholder
   where org_id = v_org_id and completed_by_user = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('gate_checklist_items', v_n);

  -- gate_approvals
  update public.gate_approvals
     set approver_user_id = v_placeholder
   where org_id = v_org_id and approver_user_id = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('gate_approvals', v_n);

  -- formulations
  update public.formulations
     set created_by_user = case when created_by_user = target_user_id then v_placeholder else created_by_user end,
         locked_by_user  = case when locked_by_user  = target_user_id then v_placeholder else locked_by_user end
   where org_id = v_org_id
     and (created_by_user = target_user_id or locked_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('formulations', v_n);

  -- risks
  update public.risks
     set owner_user_id  = case when owner_user_id  = target_user_id then v_placeholder else owner_user_id end,
         created_by_user= case when created_by_user= target_user_id then v_placeholder else created_by_user end,
         closed_by_user = case when closed_by_user = target_user_id then v_placeholder else closed_by_user end
   where org_id = v_org_id
     and (owner_user_id = target_user_id or created_by_user = target_user_id or closed_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('risks', v_n);

  -- compliance_docs
  update public.compliance_docs
     set uploaded_by_user = case when uploaded_by_user = target_user_id then v_placeholder else uploaded_by_user end,
         created_by_user   = case when created_by_user   = target_user_id then v_placeholder else created_by_user end
   where org_id = v_org_id
     and (uploaded_by_user = target_user_id or created_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('compliance_docs', v_n);

  -- Module audit tables: keep the row (regulatory audit retention) but anonymise the
  -- actor FK so the subject's identity is erased per Art. 17 while history survives.
  update public.formulation_audit_log
     set actor_user_id = v_placeholder
   where actor_user_id = target_user_id
     and formulation_id in (
       select f.id from public.formulations f where f.org_id = v_org_id
     );
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('formulation_audit_log', v_n);

  update public.fa_allergen_overrides
     set actor_user_id = v_placeholder
   where org_id = v_org_id and actor_user_id = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('fa_allergen_overrides', v_n);

  -- formulation_versions has no org_id column; scope through the parent formulation.
  update public.formulation_versions fv
     set created_by_user = v_placeholder
   where fv.created_by_user = target_user_id
     and fv.formulation_id in (
       select f.id from public.formulations f where f.org_id = v_org_id
     );
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('formulation_versions', v_n);

  -- prod_detail (Production Detail Dept block) — named in the T-089 erasure scope.
  -- The table currently carries NO user-FK (org_id + product_code only), so there
  -- is nothing to pseudonymise: the count is always 0. We still emit an explicit
  -- prod_detail key so the contract's named scope is provably covered, and so a
  -- future user-FK on this table becomes a single-line change (add it to the
  -- WHERE/SET) that the count assertions immediately exercise.
  v_n := 0;
  v_counts := v_counts || jsonb_build_object('prod_detail', v_n);

  -- Audit: one security-retained row per invocation (AC2 / Foundation §15).
  insert into public.audit_events (
    org_id, actor_type, action, resource_type, resource_id,
    before_state, after_state, request_id, retention_class
  )
  values (
    v_org_id,
    'system',
    'gdpr.erasure_executed',
    'gdpr_erasure',
    target_user_id::text,
    null,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'placeholder_user_id', v_placeholder,
      'counts', v_counts
    ),
    gen_random_uuid(),
    'security'
  );

  return v_counts;
end;
$$;

comment on function public.gdpr_redact_user_pii(uuid) is
  'T-089: GDPR Art.17 right-to-erasure for NPD. Pseudonymises subject user-FK '
  'references to the anonymisation sentinel (00000000-…-0000) within the active '
  'org context, writes a gdpr.erasure_executed audit_events row, returns per-table '
  'counts. SECURITY DEFINER; pseudonymise (never delete); org-scoped via '
  'app.current_org_id(). Reciprocal of foundation @monopilot/gdpr handler (T-113).';

-- Only the application role (used by the foundation dispatcher transaction) and the
-- Supabase service_role may execute the erasure. Lock everyone else out.
revoke all on function public.gdpr_redact_user_pii(uuid) from public;
grant execute on function public.gdpr_redact_user_pii(uuid) to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.gdpr_redact_user_pii(uuid) to service_role';
  end if;
end
$$;
