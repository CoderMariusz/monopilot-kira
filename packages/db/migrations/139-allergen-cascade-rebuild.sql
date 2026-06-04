-- T-099: Allergens cascade bulk-rebuild worker.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

alter table public.outbox_events drop constraint if exists outbox_events_event_type_check;
alter table public.outbox_events add constraint outbox_events_event_type_check check (
  event_type in (
    'audit.recorded',
    'bom.initial_version_created',
    'bom.version_submitted',
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

create table if not exists public.allergen_cascade_rebuild_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  source_event_id uuid not null,
  source_event_type text not null,
  status text not null default 'pending',
  run_after timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint allergen_cascade_rebuild_jobs_status_check
    check (status in ('pending', 'processing', 'processed')),
  constraint allergen_cascade_rebuild_jobs_source_event_type_check
    check (source_event_type in (
      'reference.allergens_by_rm.bulk_changed',
      'reference.allergens_added_by_process.bulk_changed'
    )),
  constraint allergen_cascade_rebuild_jobs_dedup_unique
    unique (org_id, product_code, source_event_id)
);

create index if not exists allergen_cascade_rebuild_jobs_pending_idx
  on public.allergen_cascade_rebuild_jobs (org_id, run_after, created_at)
  where processed_at is null;

alter table public.allergen_cascade_rebuild_jobs enable row level security;
alter table public.allergen_cascade_rebuild_jobs force row level security;

drop policy if exists allergen_cascade_rebuild_jobs_org_context
  on public.allergen_cascade_rebuild_jobs;
create policy allergen_cascade_rebuild_jobs_org_context
  on public.allergen_cascade_rebuild_jobs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.allergen_cascade_rebuild_jobs from public;
grant select, insert, update on public.allergen_cascade_rebuild_jobs to app_user;

create or replace function app.queue_allergen_cascade_rebuild(
  p_org_id uuid,
  p_ingredient_codes text[],
  p_process_names text[],
  p_source_event_id uuid default gen_random_uuid(),
  p_source_event_type text default 'reference.allergens_by_rm.bulk_changed'
)
returns table (
  product_code text,
  job_id uuid,
  source_event_id uuid,
  inserted boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current_org_id uuid := app.current_org_id();
  v_run_after timestamptz := pg_catalog.now();
begin
  if v_current_org_id is null then
    raise exception 'queue_allergen_cascade_rebuild requires app.current_org_id()'
      using errcode = '28000';
  end if;

  if p_org_id is distinct from v_current_org_id then
    raise exception 'requested org % does not match current org context %', p_org_id, v_current_org_id
      using errcode = '42501';
  end if;

  if p_source_event_type not in (
    'reference.allergens_by_rm.bulk_changed',
    'reference.allergens_added_by_process.bulk_changed'
  ) then
    raise exception 'unsupported allergen cascade source event type: %', p_source_event_type
      using errcode = '23514';
  end if;

  select coalesce(max(event.created_at), '-infinity'::timestamptz) + interval '5 minutes'
    into v_run_after
  from public.outbox_events event
  where event.org_id = p_org_id
    and event.event_type = 'npd.allergens.bulk_rebuild_completed'
    and event.created_at > pg_catalog.now() - interval '5 minutes';

  v_run_after := greatest(pg_catalog.now(), v_run_after);

  return query
  with normalized_ingredients as (
    select distinct pg_catalog.btrim(code) as ingredient_code
    from unnest(coalesce(p_ingredient_codes, '{}'::text[])) code
    where pg_catalog.btrim(code) <> ''
  ),
  normalized_processes as (
    select distinct pg_catalog.btrim(name) as process_name
    from unnest(coalesce(p_process_names, '{}'::text[])) name
    where pg_catalog.btrim(name) <> ''
  ),
  affected_by_rm as (
    select distinct product.product_code as affected_product_code
    from public.product
    cross join lateral pg_catalog.regexp_split_to_table(
      coalesce(product.ingredient_codes, ''), '\s*,\s*'
    ) parsed(ingredient_code)
    join normalized_ingredients changed
      on changed.ingredient_code = pg_catalog.btrim(parsed.ingredient_code)
    where product.org_id = p_org_id
      and product.deleted_at is null
  ),
  affected_by_process as (
    select distinct detail.product_code as affected_product_code
    from public.prod_detail detail
    cross join lateral (
      values
        (detail.manufacturing_operation_1),
        (detail.manufacturing_operation_2),
        (detail.manufacturing_operation_3),
        (detail.manufacturing_operation_4)
    ) ops(process_name)
    join normalized_processes changed
      on changed.process_name = ops.process_name
    join public.product product
      on product.product_code = detail.product_code
     and product.org_id = detail.org_id
     and product.deleted_at is null
    where detail.org_id = p_org_id
  ),
  affected as (
    select affected_by_rm.affected_product_code from affected_by_rm
    union
    select affected_by_process.affected_product_code from affected_by_process
  ),
  inserted_jobs as (
    insert into public.allergen_cascade_rebuild_jobs (
      org_id,
      product_code,
      source_event_id,
      source_event_type,
      run_after
    )
    select p_org_id, affected.affected_product_code, p_source_event_id, p_source_event_type, v_run_after
    from affected
    on conflict on constraint allergen_cascade_rebuild_jobs_dedup_unique do nothing
    returning allergen_cascade_rebuild_jobs.product_code,
              allergen_cascade_rebuild_jobs.id,
              allergen_cascade_rebuild_jobs.source_event_id
  )
  select affected.affected_product_code,
         coalesce(inserted_jobs.id, existing.id) as job_id,
         p_source_event_id as source_event_id,
         inserted_jobs.id is not null as inserted
  from affected
  left join inserted_jobs
    on inserted_jobs.product_code = affected.affected_product_code
  left join public.allergen_cascade_rebuild_jobs existing
    on existing.org_id = p_org_id
   and existing.product_code = affected.affected_product_code
   and existing.source_event_id = p_source_event_id
  order by affected.affected_product_code;
end;
$$;

comment on function app.queue_allergen_cascade_rebuild(uuid, text[], text[], uuid, text) is
  'T-099: queues one idempotent allergen rebuild job per affected FA product for the current app.current_org_id(); source event replay is deduped by (org_id, product_code, source_event_id).';

revoke all on function app.queue_allergen_cascade_rebuild(uuid, text[], text[], uuid, text) from public;
grant execute on function app.queue_allergen_cascade_rebuild(uuid, text[], text[], uuid, text) to app_user;

create or replace function app.queue_allergen_cascade_rebuild(
  p_org_id uuid,
  p_ingredient_codes text[],
  p_process_names text[]
)
returns table (
  product_code text,
  job_id uuid,
  source_event_id uuid,
  inserted boolean
)
language sql
security definer
set search_path = pg_catalog
as $$
  select *
  from app.queue_allergen_cascade_rebuild(
    p_org_id,
    p_ingredient_codes,
    p_process_names,
    gen_random_uuid(),
    'reference.allergens_by_rm.bulk_changed'
  )
$$;

revoke all on function app.queue_allergen_cascade_rebuild(uuid, text[], text[]) from public;
grant execute on function app.queue_allergen_cascade_rebuild(uuid, text[], text[]) to app_user;

grant select, insert on public.outbox_events to app_user;
grant usage, select on sequence public.outbox_events_id_seq to app_user;
