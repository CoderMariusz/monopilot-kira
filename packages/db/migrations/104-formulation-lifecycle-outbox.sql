-- Migration 104: T-064 formulation lifecycle outbox + locked ingredient guard.
-- Wave0 lock: org_id business scope remains enforced through app.current_org_id().

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'org.created', 'user.invited', 'role.assigned', 'audit.recorded',
      'brief.created', 'brief.converted',
      'fg.created', 'fg.allergens_changed', 'fg.intermediate_code_changed',
      'fa.created', 'fa.core_closed', 'fa.dept_closed', 'fa.built', 'fa.built_reset',
      'fa.allergens_changed', 'fa.intermediate_code_changed',
      'bom.initial_version_created', 'fg.bom.released', 'bom.version_submitted',
      'lp.received', 'wo.ready', 'quality.recorded', 'shipment.created',
      'tenant.migration.run', 'tenant.migration.run.failed', 'tenant.cohort.advanced',
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
      'onboarding.step.advance', 'onboarding.step.back', 'onboarding.step.skip',
      'onboarding.step.jump', 'onboarding.step.restart', 'onboarding.first_wo_recorded',
      'formulation.submitted_for_trial', 'formulation.locked'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'T-064: includes formulation lifecycle events while preserving migration 102 event union.';

create or replace function public.formulation_ingredients_reject_locked_version_mutation()
returns trigger
language plpgsql
as $$
declare
  v_version_id uuid;
  v_state text;
begin
  v_version_id := case when tg_op = 'DELETE' then old.version_id else new.version_id end;

  select version.state into v_state
  from public.formulation_versions version
  where version.id = v_version_id;

  if v_state = 'locked' then
    raise exception 'locked formulation versions cannot mutate ingredient rows';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists formulation_ingredients_reject_locked_version_mutation on public.formulation_ingredients;
create trigger formulation_ingredients_reject_locked_version_mutation
  before insert or update or delete on public.formulation_ingredients
  for each row
  execute function public.formulation_ingredients_reject_locked_version_mutation();
