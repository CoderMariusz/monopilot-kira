-- Migration 185: 08-Production — (A) admit the production.* / wo.* outbox events to the
-- outbox_events CHECK constraint (keep the enum↔CHECK drift gate green), and (B) grant the
-- production.* RBAC permission family to the org-admin role family + production operator/
-- supervisor roles in BOTH the normalized role_permissions table and the legacy roles.permissions
-- jsonb cache, with an AFTER INSERT trigger + full backfill.
-- PRD: docs/prd/08-PRODUCTION-PRD.md §3.2 (RBAC), §6/§12/§13 (events).
-- Tasks: T-056 (permission enum) + the recurring-live-bug RBAC-seed P0 (class 1).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_PRODUCTION_PERMISSIONS).
-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_PRODUCTION_EVENTS).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

-- ===========================================================================
-- (A) Outbox event CHECK — drop + recreate with the full vocabulary (152 list + 11 new
--     08-production events). The enum↔CHECK drift gate (packages/outbox check-drift.test.ts)
--     asserts THIS migration's CHECK string set === DB_EVENT_TYPES, so the list below MUST
--     stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys).
-- ===========================================================================
alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'audit.recorded',
      'bom.initial_version_created',
      'bom.version_submitted',
      'brief.completed_for_project',
      'brief.converted',
      'brief.created',
      'compliance_doc.deleted',
      'compliance_doc.expired',
      'compliance_doc.expiring',
      'compliance_doc.uploaded',
      'd365.cache.refreshed',
      'fa.allergens_changed',
      'fa.built',
      'fa.built_reset',
      'fa.cascade',
      'fa.core_closed',
      'fa.created',
      'fa.deleted',
      'fa.dept_closed',
      'fa.dept_reopened',
      'fa.edit',
      'fa.intermediate_code_changed',
      'fa.recipe_changed',
      'fa.template_applied',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.edit',
      'fg.intermediate_code_changed',
      'fg.release_blocked',
      'fg.released_to_factory',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'manufacturing_operations.created',
      'manufacturing_operations.deactivated',
      'manufacturing_operations.reset_to_seed',
      'manufacturing_operations.updated',
      'npd.allergens.bulk_rebuild_completed',
      'npd.builder.released_records_created',
      'npd.fg_candidate_mapped',
      'npd.gate.advanced',
      'npd.gate.approved',
      'npd.gate.reverted',
      'npd.project.brief_mapped',
      'npd.project.created',
      'npd.project.legacy_stages_closed',
      'npd.project.release_requested',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'org.mfa_enrollment.forced',
      'org.security_policy.updated',
      'production.allergen_changeover.validated',
      'production.changeover.signed',
      'production.consume.blocked',
      'production.consume.completed',
      'production.downtime.recorded',
      'production.oee.snapshot',
      'production.output.recorded',
      'production.waste.recorded',
      'production.wo.closed',
      'production.wo.completed',
      'production.wo.started',
      'quality.recorded',
      'reference.allergens_added_by_process.bulk_changed',
      'reference.allergens_by_rm.bulk_changed',
      'reference.csv.committed',
      'reference.row.soft_deleted',
      'reference.row.upserted',
      'risk.created',
      'role.assigned',
      'rule.deployed',
      'settings.core_flag.updated',
      'settings.dept_override.updated',
      'settings.ip_allowlist.changed',
      'settings.line.upserted',
      'settings.location.deleted',
      'settings.location.imported',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.module.disabled',
      'settings.module.enabled',
      'settings.module.toggled',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'settings.notification_rule_updated',
      'settings.org.created',
      'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.rule.deployed',
      'settings.rule_variant.updated',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.upgrade.completed',
      'settings.upgrade.promoted',
      'settings.upgrade.rolled_back',
      'settings.upgrade.scheduled',
      'settings.user.accepted',
      'settings.user.deactivated',
      'settings.user.invitation_resent',
      'settings.user.invited',
      'settings.warehouse.deactivated',
      'shipment.created',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'unit_of_measure.conversion_created',
      'unit_of_measure.created',
      'unit_of_measure.soft_deleted',
      'user.invited',
      'wo.ready'
    )
  );

-- ===========================================================================
-- (B) production.* RBAC permission seed.
--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154):
--   adding the production.* strings to the enum (T-056) grants NOBODY access. The deployed
--   org administrator is on the canonical org-admin role family, which receives NONE of the
--   production.* strings — so every production page/action 403s at live Gate-5.
--
--   This grants:
--     * the COMPLETE production.* set (17 strings) to the org-admin role family;
--     * the operator-facing subset to a production operator role family;
--     * the supervisor/approver subset to a production supervisor role family;
--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
--   existing org, with an AFTER INSERT trigger so new orgs inherit it.
--   Operator/supervisor role codes are matched defensively across naming conventions; the grant
--   is a no-op for any role code not present in an org (idempotent). The admin-family grant is
--   the load-bearing one for Gate-5 reachability. Models on 149/154.
-- ===========================================================================
create or replace function public.seed_production_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete production.* family (PRD §3.2 RBAC matrix). Mirrors ALL_PRODUCTION_PERMISSIONS.
  v_all_perms text[] := array[
    'production.wo.start',
    'production.wo.pause',
    'production.wo.resume',
    'production.wo.complete',
    'production.consumption.write',
    'production.consumption.override_approve',
    'production.output.write',
    'production.output.catch_weight_override',
    'production.waste.write',
    'production.waste.overthreshold_approve',
    'production.downtime.write',
    'production.downtime.taxonomy_edit',
    'production.changeover.write',
    'production.allergen_gate.sign_first',
    'production.allergen_gate.sign_second',
    'production.d365_dlq.replay',
    'production.oee.read'
  ];
  -- Operator-facing subset: the line operator runs WOs, consumes, records output/waste/downtime,
  -- performs changeovers, signs first on the allergen gate, and reads OEE. NOT the approver
  -- (override/overthreshold/catch-weight/taxonomy/dlq-replay/second-sign — SoD).
  v_operator_perms text[] := array[
    'production.wo.start',
    'production.wo.pause',
    'production.wo.resume',
    'production.wo.complete',
    'production.consumption.write',
    'production.output.write',
    'production.waste.write',
    'production.downtime.write',
    'production.changeover.write',
    'production.allergen_gate.sign_first',
    'production.oee.read'
  ];
  -- Supervisor subset: the approver. The full operator set PLUS the approval/override/second-sign
  -- + taxonomy + d365 dlq replay strings. (SoD: sign_first vs sign_second are distinct grants.)
  v_supervisor_perms text[] := v_all_perms;
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- production operator role family (defensive — codes vary; grant is a no-op if absent).
  v_operator_roles text[] := array['operator','production_operator','line_operator','warehouse_operator'];
  -- production supervisor role family (defensive).
  v_supervisor_roles text[] := array['supervisor','production_supervisor','shift_supervisor','production_lead'];
begin
  -- --- Normalized storage (role_permissions) ---
  -- admin family: full set.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- operator family: operator subset.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_operator_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
  on conflict (role_id, permission) do nothing;

  -- supervisor family: supervisor subset (= full set).
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

revoke all on function public.seed_production_permissions_for_org(uuid) from public;
revoke all on function public.seed_production_permissions_for_org(uuid) from app_user;

create or replace function public.seed_production_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_production_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_production_permissions_on_org_insert() from public;
revoke all on function public.seed_production_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_production_permissions on public.organizations;
create trigger trg_zzz_seed_production_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_production_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_production_permissions_for_org(v_org_id);
  end loop;
end
$$;
