-- Migration 125: T-097 canonical factory release status/read model.
-- PRD: docs/prd/01-NPD-PRD.md final decisions + 2026-05-03 E2E release spike.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- D365 export/Built are integration metadata only and never set factory usability.

alter table public.outbox_events drop constraint if exists outbox_events_event_type_check;
alter table public.outbox_events add constraint outbox_events_event_type_check check (
  event_type in (
    'audit.recorded',
    'bom.initial_version_created',
    'bom.version_submitted',
    'brief.converted',
    'brief.created',
    'compliance_doc.deleted',
    'compliance_doc.uploaded',
    'd365.cache.refreshed',
    'fa.allergens_changed',
    'fa.built',
    'fa.built_reset',
    'fa.core_closed',
    'fa.created',
    'fa.dept_closed',
    'fa.intermediate_code_changed',
    'fg.allergens_changed',
    'fg.bom.released',
    'fg.created',
    'fg.intermediate_code_changed',
    'fg.release_blocked',
    'fg.released_to_factory',
    'formulation.locked',
    'formulation.submitted_for_trial',
    'lp.received',
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
comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Authoritative union of all outbox event types through T-097 factory release status events.';

create table if not exists public.factory_release_status (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete restrict,
  release_status text not null default 'pending_npd_release',
  factory_available_at timestamptz,
  factory_approved_by uuid references public.users(id) on delete restrict,
  release_event_id bigint references public.outbox_events(id) on delete restrict,
  active_bom_header_id uuid,
  active_factory_spec_id uuid,
  release_blockers jsonb not null default '[]'::jsonb,
  requested_by uuid references public.users(id) on delete restrict,
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schema_version integer not null default 1,

  constraint factory_release_status_bundle_unique
    unique (org_id, project_id, product_code),
  constraint factory_release_status_bom_header_fk
    foreign key (active_bom_header_id, org_id)
    references public.bom_headers(id, org_id)
    on delete restrict,
  constraint factory_release_status_release_status_check
    check (release_status in (
      'pending_npd_release',
      'pending_technical_approval',
      'approved_for_factory',
      'released_to_factory',
      'blocked'
    )),
  constraint factory_release_status_blockers_array_check
    check (jsonb_typeof(release_blockers) = 'array'),
  constraint factory_release_status_schema_version_check
    check (schema_version >= 1),
  constraint factory_release_status_pending_technical_check
    check (
      release_status <> 'pending_technical_approval'
      or (
        active_bom_header_id is not null
        and active_factory_spec_id is not null
        and factory_available_at is null
      )
    ),
  constraint factory_release_status_blocked_has_blockers_check
    check (
      release_status <> 'blocked'
      or jsonb_array_length(release_blockers) > 0
    ),
  constraint factory_release_status_factory_usable_evidence_check
    check (
      release_status not in ('approved_for_factory', 'released_to_factory')
      or (
        active_bom_header_id is not null
        and active_factory_spec_id is not null
        and factory_available_at is not null
        and factory_approved_by is not null
        and release_event_id is not null
        and jsonb_array_length(release_blockers) = 0
      )
    )
);

create index if not exists factory_release_status_org_status_idx
  on public.factory_release_status (org_id, release_status, product_code);

create index if not exists factory_release_status_org_project_idx
  on public.factory_release_status (org_id, project_id);

create index if not exists factory_release_status_org_usable_idx
  on public.factory_release_status (org_id, product_code, active_bom_header_id, active_factory_spec_id)
  where release_status in ('approved_for_factory', 'released_to_factory');

create or replace function public.factory_release_status_validate()
returns trigger
language plpgsql
as $$
declare
  project_row record;
  product_org_id uuid;
  bom_row record;
  actor_org_id uuid;
  event_org_id uuid;
begin
  select p.org_id, p.product_code
    into project_row
  from public.npd_projects p
  where p.id = new.project_id;

  if project_row.org_id is null then
    raise exception 'NPD project % does not exist', new.project_id
      using errcode = '23503';
  end if;

  if project_row.org_id <> new.org_id then
    raise exception 'NPD project % does not belong to release org', new.project_id
      using errcode = '42501';
  end if;

  if project_row.product_code is not null and project_row.product_code <> new.product_code then
    raise exception 'NPD project % is not linked to product %', new.project_id, new.product_code
      using errcode = '23514';
  end if;

  select product.org_id
    into product_org_id
  from public.product
  where product.product_code = new.product_code;

  if product_org_id is null then
    raise exception 'Product % does not exist', new.product_code
      using errcode = '23503';
  end if;

  if product_org_id <> new.org_id then
    raise exception 'Product % does not belong to release org', new.product_code
      using errcode = '42501';
  end if;

  if new.active_bom_header_id is not null then
    select h.org_id, h.product_id, h.npd_project_id, h.status
      into bom_row
    from public.bom_headers h
    where h.id = new.active_bom_header_id;

    if bom_row.org_id is null then
      raise exception 'BOM header % does not exist', new.active_bom_header_id
        using errcode = '23503';
    end if;

    if bom_row.org_id <> new.org_id then
      raise exception 'BOM header % does not belong to release org', new.active_bom_header_id
        using errcode = '42501';
    end if;

    if bom_row.product_id is not null and bom_row.product_id <> new.product_code then
      raise exception 'BOM header % is not linked to product %', new.active_bom_header_id, new.product_code
        using errcode = '23514';
    end if;

    if bom_row.npd_project_id is not null and bom_row.npd_project_id <> new.project_id then
      raise exception 'BOM header % is not linked to project %', new.active_bom_header_id, new.project_id
        using errcode = '23514';
    end if;

    if new.release_status in ('approved_for_factory', 'released_to_factory')
       and bom_row.status not in ('technical_approved', 'active') then
      raise exception 'factory-usable release requires Technical-approved active BOM/spec evidence'
        using errcode = '23514';
    end if;
  end if;

  if new.factory_approved_by is not null then
    select users.org_id
      into actor_org_id
    from public.users
    where users.id = new.factory_approved_by;

    if actor_org_id is null then
      raise exception 'Factory approver % does not exist', new.factory_approved_by
        using errcode = '23503';
    end if;

    if actor_org_id <> new.org_id then
      raise exception 'Factory approver % does not belong to release org', new.factory_approved_by
        using errcode = '42501';
    end if;
  end if;

  if new.requested_by is not null then
    select users.org_id
      into actor_org_id
    from public.users
    where users.id = new.requested_by;

    if actor_org_id is null then
      raise exception 'Release requester % does not exist', new.requested_by
        using errcode = '23503';
    end if;

    if actor_org_id <> new.org_id then
      raise exception 'Release requester % does not belong to release org', new.requested_by
        using errcode = '42501';
    end if;
  end if;

  if new.release_event_id is not null then
    select outbox_events.org_id
      into event_org_id
    from public.outbox_events
    where outbox_events.id = new.release_event_id;

    if event_org_id is null then
      raise exception 'Release event % does not exist', new.release_event_id
        using errcode = '23503';
    end if;

    if event_org_id <> new.org_id then
      raise exception 'Release event % does not belong to release org', new.release_event_id
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists factory_release_status_validate on public.factory_release_status;
create trigger factory_release_status_validate
  before insert or update on public.factory_release_status
  for each row
  execute function public.factory_release_status_validate();

alter table public.factory_release_status enable row level security;
alter table public.factory_release_status force row level security;

drop policy if exists factory_release_status_org_context on public.factory_release_status;
create policy factory_release_status_org_context
  on public.factory_release_status
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.factory_release_status from public;
revoke all on public.factory_release_status from app_user;
grant select, insert, update, delete on public.factory_release_status to app_user;

revoke all on function public.factory_release_status_validate() from public;
grant execute on function public.factory_release_status_validate() to app_user;

grant select, insert on public.outbox_events to app_user;
grant usage, select on sequence public.outbox_events_id_seq to app_user;

comment on table public.factory_release_status
  is 'T-097 canonical factory release read model. Factory/Planning may treat only approved_for_factory or released_to_factory as usable. D365 export and Built are not release state.';

comment on column public.factory_release_status.active_factory_spec_id
  is 'Technical-owned factory_specs id. No FK here until 03-TECHNICAL owns/provisions factory_specs; T-097 must not create that table.';
