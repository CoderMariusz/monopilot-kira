-- T-083: 01-NPD-i compliance docs schema.
-- PRD: docs/prd/01-NPD-PRD.md §19.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create table if not exists public.compliance_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  doc_type text not null,
  title text not null,
  file_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  version_number integer not null default 1,
  expires_at date,
  uploaded_by_user uuid not null references public.users(id),
  uploaded_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  external_id text,
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id uuid,
  schema_version integer not null default 1,
  constraint compliance_docs_doc_type_check
    check (doc_type in ('CoA', 'SDS', 'Spec', 'Cert', 'Other')),
  constraint compliance_docs_title_length_check
    check (length(title) between 3 and 300),
  constraint compliance_docs_file_path_nonempty_check
    check (length(pg_catalog.btrim(file_path)) > 0),
  constraint compliance_docs_mime_type_check
    check (mime_type in ('application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  constraint compliance_docs_file_size_bytes_check
    check (file_size_bytes > 0 and file_size_bytes <= 20 * 1024 * 1024),
  constraint compliance_docs_version_number_check
    check (version_number >= 1),
  constraint compliance_docs_org_product_doc_version_unique
    unique (org_id, product_code, doc_type, version_number)
);

create index if not exists compliance_docs_org_product_active_idx
  on public.compliance_docs (org_id, product_code)
  where deleted_at is null;

create index if not exists compliance_docs_org_expires_active_idx
  on public.compliance_docs (org_id, expires_at)
  where deleted_at is null and expires_at is not null;

alter table public.compliance_docs enable row level security;
alter table public.compliance_docs force row level security;

drop policy if exists compliance_docs_org_context on public.compliance_docs;
create policy compliance_docs_org_context
  on public.compliance_docs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.compliance_docs from public;
revoke all on public.compliance_docs from app_user;
grant select, insert, update, delete on public.compliance_docs to app_user;
