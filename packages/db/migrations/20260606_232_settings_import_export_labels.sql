-- Settings Import/Export master-data hub + Label Templates data layer.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- Local migration file only for the Settings buildout; do not apply to remote DB from Codex.

create table if not exists public.import_export_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  target text not null,
  status text not null default 'queued',
  progress_processed integer not null default 0,
  progress_total integer not null default 0,
  source_file_name text,
  content_type text,
  download_url text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint import_export_jobs_kind_check check (kind in ('import', 'export')),
  constraint import_export_jobs_status_check check (status in ('queued', 'running', 'completed', 'failed')),
  constraint import_export_jobs_progress_check check (progress_processed >= 0 and progress_total >= 0),
  constraint import_export_jobs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists import_export_jobs_org_created_idx
  on public.import_export_jobs (org_id, created_at desc);

create index if not exists import_export_jobs_org_target_kind_idx
  on public.import_export_jobs (org_id, target, kind, created_at desc);

create or replace function public.import_export_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists import_export_jobs_set_updated_at on public.import_export_jobs;
create trigger import_export_jobs_set_updated_at
  before update on public.import_export_jobs
  for each row execute function public.import_export_jobs_set_updated_at();

alter table public.import_export_jobs enable row level security;
alter table public.import_export_jobs force row level security;

drop policy if exists import_export_jobs_org_context on public.import_export_jobs;
create policy import_export_jobs_org_context
  on public.import_export_jobs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.import_export_jobs from public;
revoke all on public.import_export_jobs from app_user;
grant select, insert, update, delete on public.import_export_jobs to app_user;

comment on table public.import_export_jobs
  is 'Settings Import/Export job ledger. Includes global Settings jobs and master-data hub imports; org_id is isolated by app.current_org_id().';

create table if not exists public.label_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  size text not null,
  used_on text not null default '',
  elements jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint label_templates_status_check check (status in ('draft', 'active', 'archived')),
  constraint label_templates_elements_json_check check (jsonb_typeof(elements) in ('array', 'object')),
  constraint label_templates_name_not_blank_check check (length(btrim(name)) > 0),
  constraint label_templates_size_not_blank_check check (length(btrim(size)) > 0)
);

create unique index if not exists label_templates_org_name_unique_idx
  on public.label_templates (org_id, lower(name));

create index if not exists label_templates_org_updated_idx
  on public.label_templates (org_id, updated_at desc);

create index if not exists label_templates_org_status_idx
  on public.label_templates (org_id, status);

create or replace function public.label_templates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists label_templates_set_updated_at on public.label_templates;
create trigger label_templates_set_updated_at
  before update on public.label_templates
  for each row execute function public.label_templates_set_updated_at();

alter table public.label_templates enable row level security;
alter table public.label_templates force row level security;

drop policy if exists label_templates_org_context on public.label_templates;
create policy label_templates_org_context
  on public.label_templates
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.label_templates from public;
revoke all on public.label_templates from app_user;
grant select, insert, update, delete on public.label_templates to app_user;

comment on table public.label_templates
  is 'Settings Label Templates list/editor storage. elements is a jsonb blob owned by the frontend editor; org_id is isolated by app.current_org_id().';
