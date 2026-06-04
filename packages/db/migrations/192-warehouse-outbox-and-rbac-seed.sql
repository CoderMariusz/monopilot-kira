-- Migration 192: 05-Warehouse — (A) admit the warehouse.* LP-lifecycle outbox events to the
-- outbox_events CHECK constraint (keep the enum<->CHECK drift gate green), and (B) grant the
-- warehouse.* RBAC permission family to the org-admin role family + warehouse operator/scanner
-- roles in BOTH the normalized role_permissions table and the legacy roles.permissions jsonb
-- cache, with an AFTER INSERT trigger + full backfill.
-- PRD: docs/prd/05-WAREHOUSE-PRD.md §3 (RBAC), §5/§6/§7/§8/§9 (LP lifecycle + FEFO), §11 (events).
-- Tasks: T-058 (permission enum) + the recurring-live-bug RBAC-seed P0 (class 1).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_WAREHOUSE_PERMISSIONS).
-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_WAREHOUSE_EVENTS / DB_EVENT_TYPES).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

-- ===========================================================================
-- (A) Outbox event CHECK — drop + recreate with the FULL vocabulary (189's 122 list + the 4 new
--     05-warehouse events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
--     asserts THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the
--     list below MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys).
--     Strict superset of 189 — no event dropped.
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
      'catch_weight.variance_exceeded',
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
      'quality.atp_swab_failed',
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
      'settings.d365_sync.updated',
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
      'warehouse.lp.received',
      'warehouse.lp.shipped',
      'warehouse.lp.transitioned',
      'warehouse.material.consumed',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (126 types incl warehouse.*).';

-- ===========================================================================
-- (B) warehouse.* RBAC permission seed.
--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185):
--   adding the warehouse.* strings to the enum (T-058) grants NOBODY access. The deployed
--   org administrator is on the canonical org-admin role family, which receives NONE of the
--   warehouse.* strings — so every warehouse page/action 403s at live Gate-5.
--
--   This grants:
--     * the COMPLETE warehouse.* set (13 strings) to the org-admin role family;
--     * the operator/scanner-facing subset to a warehouse operator/scanner role family;
--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
--   existing org, with an AFTER INSERT trigger so new orgs inherit it.
--   Operator/scanner role codes are matched defensively across naming conventions; the grant
--   is a no-op for any role code not present in an org (idempotent). The admin-family grant is
--   the load-bearing one for Gate-5 reachability. Models on 149/154/185.
-- ===========================================================================
create or replace function public.seed_warehouse_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete warehouse.* family (PRD §3 RBAC matrix). Mirrors ALL_WAREHOUSE_PERMISSIONS.
  v_all_perms text[] := array[
    'warehouse.lp.create',
    'warehouse.lp.split',
    'warehouse.lp.merge',
    'warehouse.lp.reserve',
    'warehouse.lp.consume',
    'warehouse.lp.block',
    'warehouse.lp.ship',
    'warehouse.lp.force_unlock',
    'warehouse.grn.receive',
    'warehouse.stock.move',
    'warehouse.stock.adjust',
    'warehouse.inventory.read',
    'warehouse.fefo.override'
  ];
  -- Operator/scanner-facing subset: receives, creates/splits/merges LPs, reserves, consumes,
  -- moves stock, reads inventory, and may ship. NOT the elevated/approval strings
  -- (force_unlock = WH-101 elevated; stock.adjust = >10% manager gate; fefo.override = deviation
  -- reason audit). SoD: those stay admin-only.
  v_operator_perms text[] := array[
    'warehouse.lp.create',
    'warehouse.lp.split',
    'warehouse.lp.merge',
    'warehouse.lp.reserve',
    'warehouse.lp.consume',
    'warehouse.lp.block',
    'warehouse.lp.ship',
    'warehouse.grn.receive',
    'warehouse.stock.move',
    'warehouse.inventory.read'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- warehouse operator/scanner role family (defensive — codes vary; grant is a no-op if absent).
  v_operator_roles text[] := array[
    'operator','warehouse_operator','warehouse_clerk','scanner','scanner_operator',
    'production_operator','line_operator'
  ];
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

  -- operator/scanner family: operator subset.
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

revoke all on function public.seed_warehouse_permissions_for_org(uuid) from public;
revoke all on function public.seed_warehouse_permissions_for_org(uuid) from app_user;

create or replace function public.seed_warehouse_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_warehouse_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_warehouse_permissions_on_org_insert() from public;
revoke all on function public.seed_warehouse_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_warehouse_permissions on public.organizations;
create trigger trg_zzz_seed_warehouse_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_warehouse_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_warehouse_permissions_for_org(v_org_id);
  end loop;
end
$$;
