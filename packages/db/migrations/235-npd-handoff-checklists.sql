-- Migration 235: 01-NPD HANDOFF stage — handoff_checklists + handoff_checklist_items.
-- PRD: docs/prd/01-NPD-PRD.md (Handoff stage); NPD-owned, project-scoped (one checklist per project).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-applyable: no superuser ops; module-local updated_at trigger.
-- destination_bom_code / destination_warehouse_id are soft references to 03-technical bom_headers
-- and 05-warehouse warehouses respectively — NO hard cross-module FK.

create table if not exists public.handoff_checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  bom_verification_status text,
  destination_bom_code text, -- soft ref to bom_headers (03-technical); service-layer-validated, NOT a DB FK.
  promote_to_production_date date,
  destination_warehouse_id uuid, -- soft ref to warehouses (05-warehouse); service-layer-validated, NOT a DB FK.
  notes text,
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  constraint handoff_checklists_org_project_unique
    unique (org_id, project_id)
);

create index if not exists handoff_checklists_org_project_idx
  on public.handoff_checklists (org_id, project_id);

create table if not exists public.handoff_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  handoff_checklist_id uuid not null references public.handoff_checklists(id) on delete cascade,
  label text not null,
  is_checked boolean not null default false,
  display_order integer not null default 0,
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create index if not exists handoff_checklist_items_org_checklist_idx
  on public.handoff_checklist_items (org_id, handoff_checklist_id);

create or replace function public.npd_handoff_checklists_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists handoff_checklists_set_updated_at on public.handoff_checklists;
create trigger handoff_checklists_set_updated_at
  before update on public.handoff_checklists
  for each row execute function public.npd_handoff_checklists_set_updated_at();

drop trigger if exists handoff_checklist_items_set_updated_at on public.handoff_checklist_items;
create trigger handoff_checklist_items_set_updated_at
  before update on public.handoff_checklist_items
  for each row execute function public.npd_handoff_checklists_set_updated_at();

-- RLS: handoff_checklists
alter table public.handoff_checklists enable row level security;
alter table public.handoff_checklists force row level security;
drop policy if exists handoff_checklists_org_context on public.handoff_checklists;
create policy handoff_checklists_org_context
  on public.handoff_checklists
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- RLS: handoff_checklist_items
alter table public.handoff_checklist_items enable row level security;
alter table public.handoff_checklist_items force row level security;
drop policy if exists handoff_checklist_items_org_context on public.handoff_checklist_items;
create policy handoff_checklist_items_org_context
  on public.handoff_checklist_items
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Grants
revoke all on public.handoff_checklists from public;
revoke all on public.handoff_checklists from app_user;
grant select, insert, update, delete on public.handoff_checklists to app_user;

revoke all on public.handoff_checklist_items from public;
revoke all on public.handoff_checklist_items from app_user;
grant select, insert, update, delete on public.handoff_checklist_items to app_user;

comment on table public.handoff_checklists
  is 'NPD HANDOFF stage checklist, one per project (unique org_id, project_id). destination_bom_code (bom_headers, 03-technical) and destination_warehouse_id (warehouses, 05-warehouse) are soft references — no hard cross-module FK. org_id isolated by app.current_org_id().';
comment on table public.handoff_checklist_items
  is 'NPD HANDOFF checklist line items (child of handoff_checklists). org_id isolated by app.current_org_id().';
