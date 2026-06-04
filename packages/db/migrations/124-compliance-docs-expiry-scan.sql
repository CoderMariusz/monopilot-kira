-- T-085: Compliance docs expiry scan.
-- PRD: docs/prd/01-NPD-PRD.md §19.
-- Wave0 lock: org_id business scope; RLS remains app.current_org_id().

-- service_role: on managed platforms (Supabase) this role already exists WITH
-- bypassrls and is platform-owned. Setting the BYPASSRLS attribute requires
-- SUPERUSER, which the deploy connection role (Supabase `postgres`) is NOT — so the
-- old `alter role service_role bypassrls` failed live ("must be superuser to change
-- bypassrls"). Only CREATE the role when it is genuinely missing (fresh local DB,
-- where the owner IS superuser); never alter an existing platform-managed role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    begin
      create role service_role noinherit bypassrls;
    exception
      when insufficient_privilege then
        -- non-superuser env without a preexisting service_role: best-effort without bypassrls
        create role service_role noinherit;
    end;
  end if;
end $$;

alter table public.compliance_docs
  add column if not exists expiry_state text not null default 'Valid',
  add column if not exists last_expiry_scan_at timestamptz,
  add column if not exists last_notified_at timestamptz;

alter table public.compliance_docs
  drop constraint if exists compliance_docs_expiry_state_check;
alter table public.compliance_docs
  add constraint compliance_docs_expiry_state_check
  check (expiry_state in ('Valid', 'Expiring', 'Expired'));

create index if not exists compliance_docs_org_expiry_state_idx
  on public.compliance_docs (org_id, expiry_state)
  where deleted_at is null;

alter table public.compliance_docs enable row level security;
alter table public.compliance_docs force row level security;

grant select, update on public.compliance_docs to service_role;

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;
alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
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
      'fa.core_closed',
      'fa.created',
      'fa.dept_closed',
      'fa.intermediate_code_changed',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.intermediate_code_changed',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'npd.project.created',
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
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'user.invited',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Authoritative union of all outbox event types as of T-085. Re-run reconcile when adding new types.';

create or replace function public.compliance_docs_expiry_scan()
returns table (
  org_id uuid,
  doc_id uuid,
  product_code text,
  doc_type text,
  title text,
  expires_at date,
  previous_state text,
  expiry_state text,
  uploaded_by_user uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_today date := current_date;
begin
  return query
  with scoped as (
    select
      d.id,
      d.org_id,
      d.product_code,
      d.doc_type,
      d.title,
      d.expires_at,
      d.expiry_state as old_state,
      d.uploaded_by_user,
      case
        when d.expires_at is null then 'Valid'
        when d.expires_at < v_today then 'Expired'
        when d.expires_at <= v_today + 30 then 'Expiring'
        else 'Valid'
      end as next_state
    from public.compliance_docs d
    where d.deleted_at is null
  ),
  changed as (
    update public.compliance_docs d
       set expiry_state = scoped.next_state,
           last_expiry_scan_at = pg_catalog.now()
      from scoped
     where d.id = scoped.id
       and d.expiry_state is distinct from scoped.next_state
     returning
       d.org_id,
       d.id as doc_id,
       d.product_code,
       d.doc_type,
       d.title,
       d.expires_at,
       scoped.old_state as previous_state,
       d.expiry_state,
       d.uploaded_by_user
  )
  select
    changed.org_id,
    changed.doc_id,
    changed.product_code,
    changed.doc_type,
    changed.title,
    changed.expires_at,
    changed.previous_state,
    changed.expiry_state,
    changed.uploaded_by_user
  from changed
  where changed.expiry_state in ('Expiring', 'Expired')
  order by changed.org_id, changed.doc_id;
end;
$$;

-- Prefer service_role ownership, but on managed platforms (Supabase) service_role has
-- no CREATE on schema public and therefore cannot own an object here ("permission denied
-- for schema public"). The function is SECURITY DEFINER, so it runs as its owner — and
-- the migration/owner role has bypassrls on Supabase (postgres) and is superuser locally,
-- so the cross-org RLS-bypass scan works regardless of owner. service_role only needs
-- EXECUTE (granted below). Skip the owner change where it isn't permitted.
do $$
begin
  alter function public.compliance_docs_expiry_scan() owner to service_role;
exception
  when insufficient_privilege or dependent_privilege_descriptors_still_exist then
    null;
  when others then
    -- "permission denied for schema public" surfaces as a generic privilege error on
    -- some managed platforms; never block the migration on the owner-change nicety.
    null;
end $$;
revoke all on function public.compliance_docs_expiry_scan() from public;
revoke all on function public.compliance_docs_expiry_scan() from app_user;
grant execute on function public.compliance_docs_expiry_scan() to service_role;

comment on function public.compliance_docs_expiry_scan()
  is 'T-085: SECURITY DEFINER service-role expiry-state scanner for compliance docs expiring in <=30 days or already expired.';
