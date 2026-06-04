-- Migration 144: T-100 NPD G4 Launched legacy stage closeout.
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

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Full outbox event union through migration 144, including T-100 npd.project.legacy_stages_closed.';

create table if not exists public.npd_legacy_closeout (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  npd_project_id uuid not null references public.npd_projects(id) on delete cascade,
  fg_product_code text not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null references public.users(id) on delete restrict,
  release_event_id bigint not null references public.outbox_events(id) on delete restrict,
  trial_shelf_life_set boolean not null,
  trial_allergens_cascade_recomputed_at timestamptz not null,
  pilot_wo_id uuid,
  handoff_g4_esign_id uuid not null references public.gate_approvals(id) on delete restrict,
  handoff_bom_header_id uuid not null,
  packaging_snapshot_jsonb jsonb not null,
  packaging_mrp_complete boolean not null,
  external_id text,
  created_at timestamptz not null default now(),
  created_by_user uuid references public.users(id) on delete restrict,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id uuid,
  schema_version integer not null default 1,

  constraint npd_legacy_closeout_project_unique unique (npd_project_id),
  constraint npd_legacy_closeout_product_fk
    foreign key (org_id, fg_product_code)
    references public.product(org_id, product_code)
    on delete restrict,
  constraint npd_legacy_closeout_bom_fk
    foreign key (handoff_bom_header_id, org_id)
    references public.bom_headers(id, org_id)
    on delete restrict,
  -- pilot_wo_id: SOFT link only (plain uuid, no DB FK). public.work_order is the
  -- canonical property of 08-production; a hard FK with ON DELETE RESTRICT would
  -- couple 08's work-order lifecycle to an NPD table it never signed up for
  -- (CLAUDE.md: never cross a canonical owner). Existence is validated at runtime
  -- via a read-only check in close-out-legacy-stages.ts (see the grant below).
  constraint npd_legacy_closeout_snapshot_object_check
    check (jsonb_typeof(packaging_snapshot_jsonb) = 'object'),
  constraint npd_legacy_closeout_trial_complete_check
    check (trial_shelf_life_set = true),
  constraint npd_legacy_closeout_packaging_complete_check
    check (packaging_mrp_complete = true),
  constraint npd_legacy_closeout_schema_version_check
    check (schema_version >= 1)
);

create index if not exists npd_legacy_closeout_org_project_idx
  on public.npd_legacy_closeout (org_id, npd_project_id);

create index if not exists npd_legacy_closeout_org_closed_idx
  on public.npd_legacy_closeout (org_id, closed_at desc);

alter table public.npd_legacy_closeout enable row level security;
alter table public.npd_legacy_closeout force row level security;

drop policy if exists npd_legacy_closeout_org_context on public.npd_legacy_closeout;
create policy npd_legacy_closeout_org_context
  on public.npd_legacy_closeout
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.npd_legacy_closeout from public;
revoke all on public.npd_legacy_closeout from app_user;
grant select, insert on public.npd_legacy_closeout to app_user;

-- Coordinated cross-module READ grant (deliberate, recorded in 01-npd ledger):
-- NPD's G4 Launched closeout must validate the pilot work order exists before
-- committing. This is read-only; 08-production owns work_order writes/RLS. When
-- 08-production is built, fold this grant into its migration scope and drop here.
grant select on public.work_order to app_user;
