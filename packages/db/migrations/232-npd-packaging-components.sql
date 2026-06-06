-- Migration 232: 01-NPD PACKAGING stage — packaging_components.
-- PRD: docs/prd/01-NPD-PRD.md (Packaging stage); NPD-owned, project-scoped.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-applyable: no superuser ops; module-local updated_at trigger; text+CHECK enums.

create table if not exists public.packaging_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  tier text not null,
  component_name text not null,
  material text,
  supplier_code text,
  spec text,
  cost_per_unit numeric(12, 4),
  status text not null default 'draft',
  artwork_file_id uuid,
  artwork_status text,
  display_order integer not null default 0,
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  constraint packaging_components_tier_check
    check (tier in ('primary', 'secondary')),
  constraint packaging_components_status_check
    check (status in ('approved', 'pending_artwork', 'draft')),
  constraint packaging_components_cost_per_unit_nonneg
    check (cost_per_unit is null or cost_per_unit >= 0)
);

create index if not exists packaging_components_org_project_idx
  on public.packaging_components (org_id, project_id);

create or replace function public.npd_packaging_components_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists packaging_components_set_updated_at on public.packaging_components;
create trigger packaging_components_set_updated_at
  before update on public.packaging_components
  for each row execute function public.npd_packaging_components_set_updated_at();

alter table public.packaging_components enable row level security;
alter table public.packaging_components force row level security;

drop policy if exists packaging_components_org_context on public.packaging_components;
create policy packaging_components_org_context
  on public.packaging_components
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.packaging_components from public;
revoke all on public.packaging_components from app_user;
grant select, insert, update, delete on public.packaging_components to app_user;

comment on table public.packaging_components
  is 'NPD PACKAGING stage components per project. org_id is isolated by app.current_org_id(); artwork_file_id is a nullable soft reference to a future file store.';
