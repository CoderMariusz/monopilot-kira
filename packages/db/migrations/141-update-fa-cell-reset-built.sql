-- T-009: updateFaCell reset_built trigger wiring.
-- PRD: docs/prd/01-NPD-PRD.md §7.4, §6.2, §2.2.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

alter table public.outbox_events drop constraint if exists outbox_events_event_type_check;
alter table public.outbox_events add constraint outbox_events_event_type_check check (
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
      'fg.intermediate_code_changed',
      'fg.release_blocked',
      'fg.released_to_factory',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'npd.allergens.bulk_rebuild_completed',
      'npd.builder.released_records_created',
      'npd.project.brief_mapped',
      'npd.project.created',
      'npd.project.release_requested',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'quality.recorded',
      'reference.allergens_added_by_process.bulk_changed',
      'reference.allergens_by_rm.bulk_changed',
      'risk.created',
      'role.assigned',
      'rule.deployed',
      'settings.line.upserted',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.module.toggled',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'settings.notification_rule_updated',
      'settings.org.created',
      'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.rule.deployed',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.user.accepted',
      'settings.user.deactivated',
      'settings.user.invited',
      'settings.warehouse.deactivated',
      'shipment.created',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'user.invited',
      'wo.ready'
    )
  );

create or replace function public.fa_built_v18_check_fn()
returns trigger
language plpgsql
as $$
begin
  if new.built is false and old.built is true then
    if coalesce(current_setting('app.fa_built_reset_allowed', true), '') <> 'on' then
      raise exception 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT'
        using errcode = '23514';
    end if;
  end if;

  if new.built is true and old.built is false then
    if exists (
      select 1
      from public.risks risk
      where risk.org_id = new.org_id
        and risk.product_code = new.product_code
        and risk.bucket = 'High'
        and risk.state = 'Open'
    ) then
      raise exception 'V18_HIGH_RISK_OPEN'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.fa_built_v18_check_fn() from public;

create or replace function public.fa_actor_from_local_context()
returns uuid
language plpgsql
stable
as $$
declare
  v_actor text;
begin
  v_actor := nullif(current_setting('app.fa_actor_user_id', true), '');
  if v_actor is null then
    return null;
  end if;
  return v_actor::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.fa_actor_from_local_context() from public;
grant execute on function public.fa_actor_from_local_context() to app_user;

create or replace function public.fa_reset_product_built_for_edit(
  p_org_id uuid,
  p_product_code text,
  p_actor_user_id uuid,
  p_source text,
  p_diff jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_reset boolean := false;
  v_row_count integer := 0;
begin
  perform set_config('app.fa_built_reset_allowed', 'on', true);

  update public.product
     set built = false
   where org_id = p_org_id
     and product_code = p_product_code
     and built = true;

  get diagnostics v_row_count = row_count;
  v_reset := v_row_count > 0;
  perform set_config('app.fa_built_reset_allowed', 'off', true);

  if v_reset then
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (
        p_org_id,
        'fa.built_reset',
        'fa',
        p_product_code,
        jsonb_build_object(
          'org_id', p_org_id,
          'product_code', p_product_code,
          'actor_user_id', p_actor_user_id,
          'source', p_source,
          'diff', coalesce(p_diff, '{}'::jsonb)
        ),
        'update-fa-cell-reset-built-v1'
      );
  end if;

  return v_reset;
end;
$$;

revoke all on function public.fa_reset_product_built_for_edit(uuid, text, uuid, text, jsonb) from public;
grant execute on function public.fa_reset_product_built_for_edit(uuid, text, uuid, text, jsonb) to app_user;

create or replace function public.fa_reset_built_on_product_edit_fn()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
  v_diff jsonb := '{}'::jsonb;
begin
  v_old := to_jsonb(old) - 'built';
  v_new := to_jsonb(new) - 'built';

  if old.built is true and v_old is distinct from v_new then
    new.built := false;
    v_actor := public.fa_actor_from_local_context();

    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (
        new.org_id,
        'fa.built_reset',
        'fa',
        new.product_code,
        jsonb_build_object(
          'org_id', new.org_id,
          'product_code', new.product_code,
          'actor_user_id', v_actor,
          'source', 'product',
          'diff', v_diff
        ),
        'update-fa-cell-reset-built-v1'
      );
  end if;

  return new;
end;
$$;

revoke all on function public.fa_reset_built_on_product_edit_fn() from public;

drop trigger if exists fa_reset_built_on_product_edit on public.product;
create trigger fa_reset_built_on_product_edit
  before update on public.product
  for each row
  when (old.built is true)
  execute function public.fa_reset_built_on_product_edit_fn();

create or replace function public.fa_reset_built_on_prod_detail_edit_fn()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  v_old := to_jsonb(old) - 'created_at';
  v_new := to_jsonb(new) - 'created_at';

  if v_old is distinct from v_new then
    perform public.fa_reset_product_built_for_edit(
      new.org_id,
      new.product_code,
      public.fa_actor_from_local_context(),
      'prod_detail',
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function public.fa_reset_built_on_prod_detail_edit_fn() from public;

drop trigger if exists fa_reset_built_on_prod_detail_edit on public.prod_detail;
create trigger fa_reset_built_on_prod_detail_edit
  after update on public.prod_detail
  for each row
  execute function public.fa_reset_built_on_prod_detail_edit_fn();
