-- Migration 231: Settings Products & BOMs real data-layer support.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Local migration file only for the Settings buildout; do not apply to remote DB from Codex.

-- Products & SKUs screen: reuse public.items as the canonical product/SKU table.
-- Add the missing settings-facing line association and prototype statuses.
alter table public.items
  add column if not exists default_line_id uuid;

create unique index if not exists production_lines_id_org_unique_idx
  on public.production_lines (id, org_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'items_default_line_org_fk'
  ) then
    alter table public.items
      add constraint items_default_line_org_fk
      foreign key (default_line_id, org_id)
      references public.production_lines(id, org_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists idx_items_default_line
  on public.items (org_id, default_line_id)
  where default_line_id is not null;

alter table public.items
  drop constraint if exists items_status_check;

alter table public.items
  add constraint items_status_check check (
    status in ('draft', 'active', 'deprecated', 'blocked', 'development', 'pilot', 'discontinued')
  );

comment on column public.items.default_line_id
  is 'Settings Products & SKUs: optional default production line displayed from public.production_lines. org_id remains the RLS scope via app.current_org_id().';

comment on constraint items_status_check on public.items
  is 'Includes legacy Technical statuses plus Settings prototype statuses: active, development, pilot, discontinued.';

-- BOMs & recipes screen settings: the BOM list reuses public.bom_headers/bom_lines.
-- This table stores only per-org screen/workflow preferences.
create table if not exists public.bom_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  auto_calculate_nutrition boolean not null default true,
  require_allergen_review boolean not null default true,
  retention text not null default '10',
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint bom_settings_retention_check check (retention in ('5', '10', '25', 'all'))
);

create or replace function public.bom_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists bom_settings_set_updated_at on public.bom_settings;
create trigger bom_settings_set_updated_at
  before update on public.bom_settings
  for each row execute function public.bom_settings_set_updated_at();

alter table public.bom_settings enable row level security;
alter table public.bom_settings force row level security;

drop policy if exists bom_settings_org_context on public.bom_settings;
create policy bom_settings_org_context
  on public.bom_settings
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.bom_settings from public;
revoke all on public.bom_settings from app_user;
grant select, insert, update on public.bom_settings to app_user;

comment on table public.bom_settings
  is 'Settings BOMs & recipes per-org preferences. BOM rows remain sourced from public.bom_headers/public.bom_lines; org_id is isolated by app.current_org_id().';
