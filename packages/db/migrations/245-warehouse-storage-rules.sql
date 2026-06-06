-- Migration 245: Per-warehouse storage rules (Settings > Infrastructure > Warehouses).
-- Storage rules (bin assignment strategy, mixed-lot bins, expiry warning threshold,
-- block-expired-stock) move from an implicit org-wide UI default to per-warehouse rows.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-applyable: no superuser ops; module-local updated_at trigger.
-- Idempotent: create-if-not-exists table/index/policy/trigger + idempotent backfill.

create table if not exists public.warehouse_storage_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  -- FEFO (first expired, first out), FIFO, LIFO, Manual.
  bin_assignment_strategy text not null default 'FEFO'
    constraint warehouse_storage_settings_bin_strategy_chk
      check (bin_assignment_strategy in ('FEFO', 'FIFO', 'LIFO', 'Manual')),
  -- Allow different lots in the same bin.
  mixed_lot_bins boolean not null default false,
  -- Alert when stock is within this many days of expiry.
  expiry_warning_days integer not null default 7
    constraint warehouse_storage_settings_expiry_days_chk
      check (expiry_warning_days >= 0 and expiry_warning_days <= 3650),
  -- Prevent movements of expired lots automatically.
  block_expired_stock boolean not null default true,
  -- Audit
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  constraint warehouse_storage_settings_org_warehouse_unique
    unique (org_id, warehouse_id)
);

create index if not exists warehouse_storage_settings_org_warehouse_idx
  on public.warehouse_storage_settings (org_id, warehouse_id);

-- updated_at trigger (module-local function).
create or replace function public.warehouse_storage_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists warehouse_storage_settings_set_updated_at on public.warehouse_storage_settings;
create trigger warehouse_storage_settings_set_updated_at
  before update on public.warehouse_storage_settings
  for each row execute function public.warehouse_storage_settings_set_updated_at();

-- RLS: org-scoped via app.current_org_id().
alter table public.warehouse_storage_settings enable row level security;
alter table public.warehouse_storage_settings force row level security;
drop policy if exists warehouse_storage_settings_org_context on public.warehouse_storage_settings;
create policy warehouse_storage_settings_org_context
  on public.warehouse_storage_settings
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Grants
revoke all on public.warehouse_storage_settings from public;
revoke all on public.warehouse_storage_settings from app_user;
grant select, insert, update, delete on public.warehouse_storage_settings to app_user;

-- Backfill: one default storage-settings row per existing warehouse (idempotent).
insert into public.warehouse_storage_settings (org_id, warehouse_id)
select w.org_id, w.id
  from public.warehouses w
on conflict (org_id, warehouse_id) do nothing;

comment on table public.warehouse_storage_settings
  is 'Per-warehouse storage rules (bin assignment strategy, mixed-lot bins, expiry warning days, block expired stock). One row per (org_id, warehouse_id). org_id isolated by app.current_org_id().';
