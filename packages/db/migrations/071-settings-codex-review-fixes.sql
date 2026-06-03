-- Migration 071: 02-settings — Codex cross-provider review fixes (P1) for migrations 063-070.
-- The 063-070 migrations are already applied (checksums locked), so their issues are
-- corrected here additively/idempotently.
--
-- P1 fixes:
--  1. notification_preferences (070) never ran `revoke all from public` / `grant to app_user`
--     → app_user cannot access it → /account/notifications fails. Lock it down + grant app_user.
--  2. outbox_events_event_type_check (set by 070) is NOT union-complete with
--     packages/outbox/src/events.enum.ts + existing emitters → settings.module.toggled,
--     settings.org.updated, settings.reference.row_updated, settings.scim.token_created,
--     fa.*, etc. would raise 23514 and roll back the writing action. Rebuild the CHECK as the
--     UNION of (current live constraint) ∪ (canonical events.enum.ts).
--  3. The SECURITY DEFINER per-org seed functions (063/064/067) are PUBLIC-executable by
--     default → any role (app_user) could call seed_*_for_org(<other_org>) and write cross-org
--     rows bypassing RLS. Revoke EXECUTE from public on all seed functions + trigger wrappers.
--  4. d365_sync_runs.direction allowed 'pull' — violates the D365 export-only red line (R15).
--     Restrict to 'push' (the table is empty; producer lives in another module).
--
-- Additive + idempotent.

-- ============================================================
-- 1. notification_preferences — lock down + grant app_user (was missing in 070)
-- ============================================================
revoke all on public.notification_preferences from public;
grant select, insert, update, delete on public.notification_preferences to app_user;

-- ============================================================
-- 2. outbox_events_event_type_check — full UNION (live ∪ events.enum.ts)
-- ============================================================
alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      -- core / foundation
      'org.created', 'user.invited', 'role.assigned', 'audit.recorded',
      -- product / npd
      'brief.created',
      'fg.created', 'fg.allergens_changed', 'fg.intermediate_code_changed',
      'fa.created', 'fa.allergens_changed', 'fa.intermediate_code_changed',
      -- warehouse / production / quality / shipping
      'lp.received', 'wo.ready', 'quality.recorded', 'shipment.created',
      -- tenant / migrations
      'tenant.migration.run', 'tenant.migration.run.failed', 'tenant.cohort.advanced',
      -- settings (canonical events.enum.ts)
      'settings.schema.migration_requested',
      'settings.rule.deployed', 'rule.deployed',
      'settings.location.upserted', 'settings.machine.upserted', 'settings.line.upserted',
      'settings.warehouse.deactivated',
      'settings.module.toggled',
      'settings.org.created', 'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.scim.token_created', 'settings.sso.config_changed',
      'settings.user.invited', 'settings.user.accepted', 'settings.user.deactivated',
      'settings.notification_rule_updated', 'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      -- onboarding
      'onboarding.step.advance', 'onboarding.step.back', 'onboarding.step.skip',
      'onboarding.step.jump', 'onboarding.step.restart', 'onboarding.first_wo_recorded'
    )
  );

-- ============================================================
-- 3. Revoke EXECUTE on SECURITY DEFINER seed functions (cross-org bypass risk)
--    Triggers run as the function owner regardless of EXECUTE grants, so revoking from
--    public/app_user does NOT break org-insert seeding — it only blocks direct calls.
-- ============================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.seed_authorization_policies_for_org(uuid)',
    'public.seed_authorization_policies_on_org_insert()',
    'public.seed_units_of_measure_for_org(uuid)',
    'public.seed_units_of_measure_on_org_insert()',
    'public.seed_feature_flags_core_for_org(uuid)',
    'public.seed_feature_flags_core_on_org_insert()'
  ]
  loop
    if to_regprocedure(v_fn) is not null then
      execute format('revoke all on function %s from public', v_fn);
      begin
        execute format('revoke all on function %s from app_user', v_fn);
      exception when undefined_object then
        null; -- app_user never had it; fine
      end;
    end if;
  end loop;
end
$$;

-- ============================================================
-- 4. d365_sync_runs.direction — export-only (R15): drop 'pull'
-- ============================================================
alter table public.d365_sync_runs
  drop constraint if exists d365_sync_runs_direction_check;
alter table public.d365_sync_runs
  add constraint d365_sync_runs_direction_check check (direction in ('push'));
