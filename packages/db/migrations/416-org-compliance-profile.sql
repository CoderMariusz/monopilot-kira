-- Migration 416 (DRAFT) — per-org compliance profile for document headers (BRCGS, audits, registrations).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Do not apply from Codex lanes; orchestrator applies draft migrations.

create table if not exists public.org_compliance_profile (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  brcgs_site_code text,
  certification_body text,
  certification_grade text,
  last_audit_date date,
  next_audit_date date,
  registrations jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists org_compliance_profile_org_idx
  on public.org_compliance_profile (org_id);

alter table public.org_compliance_profile enable row level security;
alter table public.org_compliance_profile force row level security;

drop policy if exists org_compliance_profile_org_context on public.org_compliance_profile;
create policy org_compliance_profile_org_context
  on public.org_compliance_profile
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.org_compliance_profile from public;
revoke all on public.org_compliance_profile from app_user;
grant select, insert, update on public.org_compliance_profile to app_user;

create or replace function public.org_compliance_profile_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.org_compliance_profile_set_updated_at() from public;

drop trigger if exists org_compliance_profile_set_updated_at on public.org_compliance_profile;
create trigger org_compliance_profile_set_updated_at
  before update on public.org_compliance_profile
  for each row
  execute function public.org_compliance_profile_set_updated_at();

comment on table public.org_compliance_profile is
  'Per-org compliance header (BRCGS site code, certification body/grade, audit dates, named registration numbers) for Phase-2/3 document engine headers.';
comment on column public.org_compliance_profile.registrations is
  'Named registration numbers keyed by registration type (e.g. fda_establishment, ec_approval).';
