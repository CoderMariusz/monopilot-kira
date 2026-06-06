-- Migration 243: NPD pivot Phase 2C — physically drop the now-dead standalone Brief tables.
-- PRD: docs/prd/01-NPD-PRD.md §9.5 (Brief) — superseded by the merged in-project brief (mig 242).
-- Wave0 lock: org_id business scope (NOT tenant_id); org-scoping via app.current_org_id().
--
-- Context: migration 242 folded the standalone Brief flow into public.npd_projects
-- (a project IS its brief from creation). The standalone /briefs UI + modals were
-- already deleted; mig 242 deferred the table drop to "a later cleanup migration once
-- GDPR/audit/V08/field-mapping references are migrated". This IS that migration:
--   1. Repoints public.gdpr_redact_user_pii() so it no longer touches public.brief
--      (CREATE OR REPLACE, brief UPDATE block removed) — otherwise right-to-erasure
--      would error once brief is gone.
--   2. Drops public.brief_lines, public.brief_to_fa_audit, public.brief (CASCADE) and
--      "Reference"."BriefFieldMapping".
--
-- Idempotent + safe: DROP ... IF EXISTS CASCADE; CREATE OR REPLACE FUNCTION.
-- KEEP: npd_projects + the merged in-project brief stage (reads npd_projects, mig 242).

-- ---------------------------------------------------------------------------
-- 1. Repoint the GDPR right-to-erasure function: remove the public.brief UPDATE.
--    Reproduced verbatim from migration 115 minus the `-- brief` block (lines 101-108)
--    and its 'brief' count key. Every other table's pseudonymisation is unchanged.
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

  -- (brief pseudonymisation removed in mig 243 — the standalone brief table is dropped;
  --  brief capture now lives on public.npd_projects, covered by the npd_projects block.)

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
  'app.current_org_id(). Reciprocal of foundation @monopilot/gdpr handler (T-113). '
  'Mig 243: brief block removed (standalone brief table dropped; capture merged into '
  'npd_projects).';

-- Re-assert grants (CREATE OR REPLACE preserves them, but be explicit + idempotent).
revoke all on function public.gdpr_redact_user_pii(uuid) from public;
grant execute on function public.gdpr_redact_user_pii(uuid) to app_user;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.gdpr_redact_user_pii(uuid) to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop the dead standalone Brief tables.
--    Order/CASCADE: brief_lines + brief_to_fa_audit FK brief(brief_id); CASCADE on
--    public.brief covers them, but we DROP children first for clarity. All IF EXISTS.
-- ---------------------------------------------------------------------------
drop table if exists public.brief_lines cascade;
drop table if exists public.brief_to_fa_audit cascade;
drop table if exists public.brief cascade;

-- Reference-schema brief→PLD field-mapping lookup (mig 100) — no longer consulted.
drop table if exists "Reference"."BriefFieldMapping" cascade;
