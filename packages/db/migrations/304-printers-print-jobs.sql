-- Migration 304: Wave E1 (labels/print) — printers + print_jobs.
-- The label print pipeline: `label_templates` (mig 239) already holds the design;
-- `printers` is the physical/PDF output target, `print_jobs` is the buffer + audit trail
-- of every print (queued|sent|failed). A PDF-mode printer needs no hardware (status sent +
-- a downloadable file), which is the testable path with no device.
--
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- site_id is the day-1 nullable column. print_jobs.template_id survives template archive
-- (FK without cascade — print history must keep pointing at the template it used).

-- ============================================================================
-- 1. printers
-- ============================================================================
create table if not exists public.printers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  name          text not null,
  printer_type  text not null default 'pdf',          -- 'zpl' | 'pdf'
  address       text,                                  -- IP / queue name (null for pdf)
  location      text,
  is_active     boolean not null default true,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint printers_type_check check (printer_type in ('zpl', 'pdf')),
  constraint printers_org_name_unique unique (org_id, name)
);

create index if not exists idx_printers_org on public.printers (org_id);
create index if not exists idx_printers_org_site on public.printers (org_id, site_id);

-- ============================================================================
-- 2. print_jobs — buffer + audit of every print request
-- ============================================================================
create table if not exists public.print_jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  printer_id    uuid references public.printers(id) on delete set null,
  template_id   uuid references public.label_templates(id) on delete set null,
  entity_type   text not null,                          -- 'lp' | 'grn_line' | 'product' | 'sscc_pallet' | ...
  entity_id     uuid,
  copies        integer not null default 1,
  payload       jsonb not null default '{}'::jsonb,     -- the resolved GS1/label data
  status        text not null default 'queued',         -- queued | sent | failed
  error_text    text,
  result_url    text,                                   -- PDF download link when status=sent (pdf mode)
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint print_jobs_status_check check (status in ('queued', 'sent', 'failed')),
  constraint print_jobs_copies_check check (copies >= 1)
);

create index if not exists idx_print_jobs_org on public.print_jobs (org_id);
create index if not exists idx_print_jobs_org_status on public.print_jobs (org_id, status);
create index if not exists idx_print_jobs_entity on public.print_jobs (org_id, entity_type, entity_id);
create index if not exists idx_print_jobs_printer on public.print_jobs (printer_id) where printer_id is not null;

-- ============================================================================
-- 3. RLS enable + force (org-only predicate; site_id day-1 nullable)
-- ============================================================================
alter table public.printers   enable row level security;
alter table public.printers   force  row level security;
alter table public.print_jobs enable row level security;
alter table public.print_jobs force  row level security;

drop policy if exists printers_org_isolation on public.printers;
create policy printers_org_isolation on public.printers
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists print_jobs_org_isolation on public.print_jobs;
create policy print_jobs_org_isolation on public.print_jobs
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ============================================================================
-- 4. Grants — fail-closed default; DML to app_user
-- ============================================================================
revoke all on public.printers   from public;
revoke all on public.printers   from app_user;
revoke all on public.print_jobs from public;
revoke all on public.print_jobs from app_user;
grant select, insert, update, delete on public.printers   to app_user;
grant select, insert, update, delete on public.print_jobs to app_user;

-- ============================================================================
-- 5. updated_at triggers (reuse the planning helper from mig 178)
-- ============================================================================
drop trigger if exists printers_set_updated_at on public.printers;
create trigger printers_set_updated_at
  before update on public.printers
  for each row execute function public.planning_mrp_set_updated_at();

drop trigger if exists print_jobs_set_updated_at on public.print_jobs;
create trigger print_jobs_set_updated_at
  before update on public.print_jobs
  for each row execute function public.planning_mrp_set_updated_at();
