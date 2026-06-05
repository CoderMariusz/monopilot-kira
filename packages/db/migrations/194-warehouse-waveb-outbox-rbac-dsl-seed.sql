-- Migration 194: 05-Warehouse wave-B — (A) admit the new warehouse.grn.received outbox event to
--   the outbox_events CHECK (keep the enum<->CHECK drift gate green), (B) grant the wave-B
--   warehouse.spare_parts.* RBAC permissions to the org-admin role family + warehouse/maintenance
--   operator roles in BOTH stores with an org-insert trigger + backfill, and (C) deploy the
--   lp_state_machine_v1 DSL rule into the 02-Settings rule_definitions registry (T-013, §6.1).
-- PRD: docs/prd/05-WAREHOUSE-PRD.md §3 (RBAC), §6.1 (LP state machine, ADR-029), §11 (events).
-- Tasks: T-013 (lp_state_machine_v1 seed), wave-B RBAC seed P0 (recurring live-bug class 1).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_WAREHOUSE_PERMISSIONS).
-- Canonical event strings: packages/outbox/src/events.enum.ts (DB_EVENT_TYPES).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

-- ===========================================================================
-- (A) Outbox event CHECK — drop + recreate with the FULL vocabulary (192's list + the new
--     warehouse.grn.received). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
--     asserts THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the
--     list below MUST stay byte-aligned with events.enum.ts. Strict superset of 192.
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
      'warehouse.grn.received',
      'warehouse.lp.received',
      'warehouse.lp.shipped',
      'warehouse.lp.transitioned',
      'warehouse.material.consumed',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (127 types incl warehouse.grn.received).';

-- ===========================================================================
-- (B) warehouse.spare_parts.* RBAC seed (wave-B).
--   ROOT CAUSE (403-everywhere / unreachable-feature class — same as 149/154/185/192): adding
--   the warehouse.spare_parts.* strings to the enum grants NOBODY access. This grants:
--     * BOTH spare_parts strings to the org-admin role family;
--     * the read string to warehouse/maintenance operator roles; the adjust string to a
--       narrower maintenance/stock-controller subset (SoD: read is broad, write is gated);
--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb), for every org,
--   with an AFTER INSERT trigger so new orgs inherit it. Idempotent (on conflict do nothing /
--   distinct jsonb). Models on 149/154/185/192.
-- ===========================================================================
create or replace function public.seed_warehouse_waveb_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_all_perms text[] := array[
    'warehouse.spare_parts.read',
    'warehouse.spare_parts.adjust'
  ];
  v_reader_perms text[] := array['warehouse.spare_parts.read'];
  v_writer_perms text[] := array['warehouse.spare_parts.read', 'warehouse.spare_parts.adjust'];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- broad reader family (operators + maintenance can SEE parts stock).
  v_reader_roles text[] := array[
    'operator','warehouse_operator','warehouse_clerk','scanner','scanner_operator',
    'production_operator','line_operator','maintenance_operator','maintenance_tech','technician'
  ];
  -- narrower writer family (maintenance / stock controllers issue/return parts).
  v_writer_roles text[] := array[
    'warehouse_operator','warehouse_clerk','maintenance_operator','maintenance_tech',
    'stock_controller','inventory_manager'
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
  cross join unnest(v_reader_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_reader_roles) or r.slug = any(v_reader_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_writer_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_writer_roles) or r.slug = any(v_writer_roles))
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
           select unnest(v_reader_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_reader_roles) or r.slug = any(v_reader_roles))
     and not (r.code = any(v_writer_roles) or r.slug = any(v_writer_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_writer_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_writer_roles) or r.slug = any(v_writer_roles));
end;
$$;

revoke all on function public.seed_warehouse_waveb_permissions_for_org(uuid) from public;
revoke all on function public.seed_warehouse_waveb_permissions_for_org(uuid) from app_user;

create or replace function public.seed_warehouse_waveb_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_warehouse_waveb_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_warehouse_waveb_permissions_on_org_insert() from public;
revoke all on function public.seed_warehouse_waveb_permissions_on_org_insert() from app_user;

-- zzz2 prefix so it fires after the 080 role-seed trigger and the 192 wave-A warehouse trigger.
drop trigger if exists trg_zzz2_seed_warehouse_waveb_permissions on public.organizations;
create trigger trg_zzz2_seed_warehouse_waveb_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_warehouse_waveb_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_warehouse_waveb_permissions_for_org(v_org_id);
  end loop;
end
$$;

-- ===========================================================================
-- (C) lp_state_machine_v1 DSL rule (T-013, §6.1, ADR-029).
--   Deploys the LP state-machine DSL into public.rule_definitions (the L1 rule registry created
--   by 02-Settings migration 039) for every existing org, plus an AFTER INSERT trigger so new
--   orgs receive it. The transitionLpState service (T-019) reads this row via getAllowedTransitions
--   — transitions are NEVER hardcoded in the service (Forbidden #4). Admin read-only (ADR-029):
--   changes go through PR/deploy, never an admin edit endpoint.
--
--   definition_json encodes every §6.1 transition with its allowed_reasons + the
--   destructive flag (reason_code mandatory, V-WH-LP-010).
-- ===========================================================================
do $$
declare
  v_rule_code text := 'lp_state_machine_v1';
  v_definition jsonb := jsonb_build_object(
    'rule_code', 'lp_state_machine_v1',
    'version', 1,
    'description', 'License Plate (LP) state machine (WH §6.1): allowed status transitions + per-transition guards + allowed reason_codes. Destructive transitions (block/merged) require reason_code (V-WH-LP-010). Admin read-only (ADR-029).',
    'handler', 'apps/web/lib/services/warehouse/lp-state-transition.ts',
    'states', jsonb_build_array(
      'received','available','reserved','allocated','consumed','blocked','merged','shipped','returned','quarantine'
    ),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', null, 'to', 'available', 'guard', 'grn.completed OR wo.output_recorded OR split.applied', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'available', 'to', 'reserved', 'guard', '04-PLAN wo.release AND hard-lock available; RM-root only (V-WH-FEFO-005)', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'reserved', 'to', 'available', 'guard', 'wo.cancelled OR reservation.released OR wo_paused timeout', 'destructive', false, 'allowed_reasons', jsonb_build_array('wo_cancelled','reservation_released','timeout')),
      jsonb_build_object('from', 'reserved', 'to', 'consumed', 'guard', '08-PROD consume_to_wo scan; 09-quality T-064 consume gate pass', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'available', 'to', 'consumed', 'guard', 'merge op (input LPs -> primary)', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'available', 'to', 'blocked', 'guard', 'qa.status=FAILED OR manual block + role IN (QA,Manager,Admin)', 'destructive', true, 'allowed_reasons', jsonb_build_array('quality_issue','damage','recall','expiry','other')),
      jsonb_build_object('from', 'blocked', 'to', 'available', 'guard', 'QA release OR manager unblock + audit reason; signed by 09-quality', 'destructive', false, 'allowed_reasons', jsonb_build_array('qa_released','manager_override','other')),
      jsonb_build_object('from', 'available', 'to', 'merged', 'guard', 'merge as secondary input -> consumed via genealogy; same product+batch+expiry; catch-weight sum (D14)', 'destructive', true, 'allowed_reasons', jsonb_build_array('merge','other')),
      jsonb_build_object('from', 'available', 'to', 'shipped', 'guard', '11-SHIPPING ship_event; SO line allocated', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'reserved', 'to', 'shipped', 'guard', '11-SHIPPING ship_event; SO line allocated', 'destructive', false, 'allowed_reasons', jsonb_build_array())
    )
  );
begin
  insert into public.rule_definitions (org_id, rule_code, rule_type, tier, definition_json, version)
  select o.id, v_rule_code, 'workflow', 'L1', v_definition, 1
    from public.organizations o
  on conflict (org_id, rule_code, version) do nothing;
end
$$;

create or replace function public.seed_lp_state_machine_rule_for_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_definition jsonb := jsonb_build_object(
    'rule_code', 'lp_state_machine_v1',
    'version', 1,
    'description', 'License Plate (LP) state machine (WH §6.1): allowed status transitions + per-transition guards + allowed reason_codes. Destructive transitions (block/merged) require reason_code (V-WH-LP-010). Admin read-only (ADR-029).',
    'handler', 'apps/web/lib/services/warehouse/lp-state-transition.ts',
    'states', jsonb_build_array(
      'received','available','reserved','allocated','consumed','blocked','merged','shipped','returned','quarantine'
    ),
    'transitions', jsonb_build_array(
      jsonb_build_object('from', null, 'to', 'available', 'guard', 'grn.completed OR wo.output_recorded OR split.applied', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'available', 'to', 'reserved', 'guard', '04-PLAN wo.release AND hard-lock available; RM-root only (V-WH-FEFO-005)', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'reserved', 'to', 'available', 'guard', 'wo.cancelled OR reservation.released OR wo_paused timeout', 'destructive', false, 'allowed_reasons', jsonb_build_array('wo_cancelled','reservation_released','timeout')),
      jsonb_build_object('from', 'reserved', 'to', 'consumed', 'guard', '08-PROD consume_to_wo scan; 09-quality T-064 consume gate pass', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'available', 'to', 'consumed', 'guard', 'merge op (input LPs -> primary)', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'available', 'to', 'blocked', 'guard', 'qa.status=FAILED OR manual block + role IN (QA,Manager,Admin)', 'destructive', true, 'allowed_reasons', jsonb_build_array('quality_issue','damage','recall','expiry','other')),
      jsonb_build_object('from', 'blocked', 'to', 'available', 'guard', 'QA release OR manager unblock + audit reason; signed by 09-quality', 'destructive', false, 'allowed_reasons', jsonb_build_array('qa_released','manager_override','other')),
      jsonb_build_object('from', 'available', 'to', 'merged', 'guard', 'merge as secondary input -> consumed via genealogy; same product+batch+expiry; catch-weight sum (D14)', 'destructive', true, 'allowed_reasons', jsonb_build_array('merge','other')),
      jsonb_build_object('from', 'available', 'to', 'shipped', 'guard', '11-SHIPPING ship_event; SO line allocated', 'destructive', false, 'allowed_reasons', jsonb_build_array()),
      jsonb_build_object('from', 'reserved', 'to', 'shipped', 'guard', '11-SHIPPING ship_event; SO line allocated', 'destructive', false, 'allowed_reasons', jsonb_build_array())
    )
  );
begin
  insert into public.rule_definitions (org_id, rule_code, rule_type, tier, definition_json, version)
  values (new.id, 'lp_state_machine_v1', 'workflow', 'L1', v_definition, 1)
  on conflict (org_id, rule_code, version) do nothing;
  return new;
end
$$;

drop trigger if exists seed_lp_state_machine_rule_after_org_insert on public.organizations;
create trigger seed_lp_state_machine_rule_after_org_insert
  after insert on public.organizations
  for each row execute function public.seed_lp_state_machine_rule_for_org();
