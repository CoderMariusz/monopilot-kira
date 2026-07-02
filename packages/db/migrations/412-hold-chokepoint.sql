-- Migration 412 (DRAFT) — quality hold chokepoint / batch text references.
-- Do not apply from Codex lanes; orchestrator applies draft migrations.

alter table public.quality_holds
  add column if not exists reference_text text;

alter table public.quality_holds
  alter column reference_id drop not null;

alter table public.quality_holds
  drop constraint if exists quality_holds_reference_family_check;

alter table public.quality_holds
  add constraint quality_holds_reference_family_check
  check (
    (
      reference_type in ('lp', 'wo', 'po', 'grn')
      and reference_id is not null
      and reference_text is null
    )
    or (
      reference_type = 'batch'
      and reference_id is null
      and nullif(reference_text, '') is not null
    )
  );

create index if not exists quality_holds_org_ref_text_idx
  on public.quality_holds (org_id, reference_type, reference_text)
  where reference_text is not null;

drop view if exists public.v_active_holds;
create view public.v_active_holds
  with (security_invoker = true)
  as
  select
    h.id                    as hold_id,
    h.hold_number,
    h.org_id,
    h.reference_type,
    h.reference_id,
    h.reference_text,
    h.priority,
    h.hold_status,
    h.created_at,
    h.estimated_release_at,
    h.default_hold_duration_days
  from public.quality_holds h
  where h.hold_status in ('open', 'investigating', 'escalated', 'quarantined')
    and h.released_at is null;

revoke all on public.v_active_holds from public;
grant select on public.v_active_holds to app_user;

comment on column public.quality_holds.reference_text is
  'Text reference for non-UUID hold references. Used for reference_type=batch batch/lot numbers.';

comment on view public.v_active_holds is
  'quality_holds: active holds only. SECURITY INVOKER; RLS flows from quality_holds. Includes reference_text for batch hold expansion.';

