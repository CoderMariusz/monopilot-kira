-- Migration 090: T-092 shared BOM SSOT for NPD initial versions and Technical approval.
-- PRD: docs/prd/01-NPD-PRD.md shared BOM version + docs/prd/03-TECHNICAL-PRD.md §5.2.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- bom_headers/bom_lines are the shared BOM SSOT. D365 is integration only, never source of truth.

create table if not exists public.bom_headers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id text references public.product(product_code) on delete restrict,
  npd_project_id uuid references public.npd_projects(id) on delete set null,
  fa_code text,
  origin_module text not null default 'technical',
  status text not null default 'draft',
  version integer not null default 1,
  supersedes_bom_header_id uuid,
  yield_pct numeric(6,3) not null default 100.000,
  effective_from date not null default current_date,
  effective_to date,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  technical_review_requested_by uuid references public.users(id),
  technical_review_requested_at timestamptz,
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid references public.users(id),
  created_by_device text,
  app_version text,
  updated_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint bom_headers_identity_unique unique (id, org_id),
  constraint bom_headers_origin_module_check
    check (origin_module in ('npd', 'technical', 'imported')),
  constraint bom_headers_status_check
    check (status in ('draft', 'in_review', 'technical_approved', 'active', 'superseded', 'archived')),
  constraint bom_headers_version_positive_check
    check (version > 0),
  constraint bom_headers_yield_pct_check
    check (yield_pct > 0 and yield_pct <= 100.000),
  constraint bom_headers_effective_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint bom_headers_approved_status_requires_approval_check
    check (status not in ('technical_approved', 'active') or (approved_by is not null and approved_at is not null)),
  constraint bom_headers_not_orphaned_check
    check (product_id is not null or npd_project_id is not null or fa_code is not null),
  constraint bom_headers_supersedes_fk
    foreign key (supersedes_bom_header_id, org_id)
    references public.bom_headers(id, org_id)
    on delete restrict
);

create unique index if not exists bom_headers_org_product_version_unique
  on public.bom_headers (org_id, product_id, version)
  where product_id is not null;

create unique index if not exists bom_headers_org_npd_project_version_unique
  on public.bom_headers (org_id, npd_project_id, version)
  where npd_project_id is not null and product_id is null;

create index if not exists bom_headers_org_npd_project_idx
  on public.bom_headers (org_id, npd_project_id, status, version desc)
  where npd_project_id is not null;

create index if not exists bom_headers_org_product_idx
  on public.bom_headers (org_id, product_id, status, version desc)
  where product_id is not null;

create unique index if not exists bom_headers_active_version_idx
  on public.bom_headers (org_id, product_id)
  where status = 'active' and product_id is not null;

create index if not exists bom_headers_technical_approval_queue_idx
  on public.bom_headers (org_id, status, technical_review_requested_at, created_at)
  where status in ('in_review', 'technical_approved');

create table if not exists public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bom_header_id uuid not null,
  line_no integer not null,
  component_code text not null,
  component_type text,
  quantity numeric(14,6) not null,
  uom text not null,
  scrap_pct numeric(5,2) not null default 0.00,
  manufacturing_operation_name text,
  sequence integer,
  is_phantom boolean not null default false,
  source text,
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint bom_lines_header_org_fk
    foreign key (bom_header_id, org_id)
    references public.bom_headers(id, org_id)
    on delete cascade,
  constraint bom_lines_line_no_check
    check (line_no > 0),
  constraint bom_lines_quantity_positive_check
    check (quantity > 0),
  constraint bom_lines_scrap_pct_check
    check (scrap_pct >= 0 and scrap_pct <= 100.00),
  constraint bom_lines_component_type_check
    check (component_type is null or component_type in ('RM', 'PM', 'WIP', 'FG')),
  constraint bom_lines_header_line_unique
    unique (bom_header_id, line_no)
);

create index if not exists bom_lines_org_header_idx
  on public.bom_lines (org_id, bom_header_id, line_no);

create index if not exists bom_lines_org_component_idx
  on public.bom_lines (org_id, component_code);

create or replace function public.bom_headers_reject_approved_content_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('technical_approved', 'active')
     and (
       new.org_id is distinct from old.org_id
       or new.product_id is distinct from old.product_id
       or new.npd_project_id is distinct from old.npd_project_id
       or new.fa_code is distinct from old.fa_code
       or new.origin_module is distinct from old.origin_module
       or new.version is distinct from old.version
       or new.supersedes_bom_header_id is distinct from old.supersedes_bom_header_id
       or new.yield_pct is distinct from old.yield_pct
       or new.effective_from is distinct from old.effective_from
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.technical_review_requested_by is distinct from old.technical_review_requested_by
       or new.technical_review_requested_at is distinct from old.technical_review_requested_at
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at
       or new.created_by_user is distinct from old.created_by_user
       or new.created_by_device is distinct from old.created_by_device
       or new.app_version is distinct from old.app_version
       or new.schema_version is distinct from old.schema_version
     ) then
    raise exception 'approved or active BOM versions are immutable; create a superseding bom_headers version instead';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists bom_headers_reject_approved_content_update on public.bom_headers;
create trigger bom_headers_reject_approved_content_update
  before update on public.bom_headers
  for each row
  execute function public.bom_headers_reject_approved_content_update();

create or replace function public.bom_lines_reject_approved_header_update()
returns trigger
language plpgsql
as $$
declare
  v_header_status text;
begin
  select status into v_header_status
  from public.bom_headers
  where id = coalesce(new.bom_header_id, old.bom_header_id);

  if v_header_status in ('technical_approved', 'active') then
    raise exception 'approved or active BOM line content is immutable; create a superseding bom_headers version instead';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
    return new;
  elsif tg_op = 'INSERT' then
    return new;
  elsif tg_op = 'DELETE' then
    return old;
  end if;

  raise exception 'unsupported bom_lines immutability trigger operation: %', tg_op;
end;
$$;

drop trigger if exists bom_lines_reject_approved_header_update on public.bom_lines;
create trigger bom_lines_reject_approved_header_update
  before insert or update or delete on public.bom_lines
  for each row
  execute function public.bom_lines_reject_approved_header_update();

alter table public.bom_headers enable row level security;
alter table public.bom_headers force row level security;

drop policy if exists bom_headers_org_context on public.bom_headers;
create policy bom_headers_org_context
  on public.bom_headers
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.bom_lines enable row level security;
alter table public.bom_lines force row level security;

drop policy if exists bom_lines_org_context on public.bom_lines;
create policy bom_lines_org_context
  on public.bom_lines
  for all
  to app_user
  using (
    org_id = app.current_org_id()
    and exists (
      select 1
      from public.bom_headers header
      where header.id = bom_header_id
        and header.org_id = app.current_org_id()
    )
  )
  with check (
    org_id = app.current_org_id()
    and exists (
      select 1
      from public.bom_headers header
      where header.id = bom_header_id
        and header.org_id = app.current_org_id()
    )
  );

revoke all on public.bom_headers from public;
revoke all on public.bom_headers from app_user;
grant select, insert, update, delete on public.bom_headers to app_user;

revoke all on public.bom_lines from public;
revoke all on public.bom_lines from app_user;
grant select, insert, update, delete on public.bom_lines to app_user;

create or replace view public.fa_bom_view
  with (security_invoker = true)
as
select
  f.product_code,
  f.org_id,
  null::integer as row_seq,
  null::text as component_type,
  null::text as component_code,
  null::numeric(14,6) as quantity,
  null::text as manufacturing_operation_name,
  null::text as source,
  'Empty'::text as d365_status,
  null::text as d365_comment
from public.fa f
where false;

revoke all on public.fa_bom_view from public;
revoke all on public.fa_bom_view from app_user;
grant select on public.fa_bom_view to app_user;

comment on table public.bom_headers
  is 'T-092: bom_headers/bom_lines are the shared BOM SSOT across NPD, Technical, Planning, Production, and integrations. D365 is integration only, never source of truth.';

comment on table public.bom_lines
  is 'T-092: Line items for the shared BOM SSOT. Initial NPD Builder BOMs and Technical post-release versions use this same model; D365 is integration only.';

comment on column public.bom_headers.status
  is 'Shared BOM lifecycle: draft, in_review, technical_approved, active, superseded, archived. technical_approved maps the Technical approval milestone before active factory use.';

comment on column public.bom_headers.origin_module
  is 'Shared BOM origin: npd for NPD Builder initial versions, technical for Technical-owned edits, imported for integration-created drafts. D365 imports are integration only, not BOM SSOT.';

comment on view public.fa_bom_view
  is 'DEPRECATED/preview-only legacy NPD computed BOM compatibility view. Not canonical; use public.bom_headers/public.bom_lines shared BOM SSOT. D365 is integration only.';
