-- Migration 261: Planning procurement backbone — suppliers.
--
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().
-- This table resolves the planning-side supplier soft refs used by MRP while
-- preserving supplier_specs ownership in 03-Technical.

create table if not exists public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  code           text not null,
  name           text not null,
  contact_jsonb  jsonb not null default '{}'::jsonb,
  currency       text not null default 'EUR',
  lead_time_days integer not null default 0,
  status         text not null default 'active',
  notes          text,
  created_by     uuid references public.users(id) on delete set null,
  updated_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),

  constraint suppliers_org_code_unique unique (org_id, code),
  constraint suppliers_status_check check (status in ('active', 'inactive', 'blocked')),
  constraint suppliers_lead_time_nonnegative_check check (lead_time_days >= 0),
  constraint suppliers_contact_jsonb_object_check check (jsonb_typeof(contact_jsonb) = 'object')
);

create index if not exists suppliers_org_status_idx on public.suppliers (org_id, status);
create index if not exists suppliers_code_idx on public.suppliers (code);

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;

drop policy if exists suppliers_org_context on public.suppliers;
create policy suppliers_org_context
  on public.suppliers
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.suppliers from public;
revoke all on public.suppliers from app_user;
grant select, insert, update, delete on public.suppliers to app_user;

create or replace function public.planning_procurement_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.planning_procurement_set_updated_at();

insert into public.suppliers
  (org_id, code, name, contact_jsonb, currency, lead_time_days, status, notes)
values
  (
    '00000000-0000-0000-0000-000000000002'::uuid,
    'SUP-DEMO-01',
    'Apex approved meat and ingredient supplier',
    jsonb_build_object('category', 'meat_ingredients', 'email', 'orders+meat@example.test'),
    'EUR',
    3,
    'active',
    'Matches the SUP-DEMO-01 supplier_specs seed used by the RM and ingredient catalog.'
  ),
  (
    '00000000-0000-0000-0000-000000000002'::uuid,
    'SUP-PKG-01',
    'Apex packaging supplier',
    jsonb_build_object('category', 'packaging', 'email', 'orders+packaging@example.test'),
    'EUR',
    7,
    'active',
    'Matches the SUP-PKG-01 supplier_specs seed used by the packaging catalog.'
  ),
  (
    '00000000-0000-0000-0000-000000000002'::uuid,
    'SUP-ING-01',
    'Apex ingredients spot supplier',
    jsonb_build_object('category', 'ingredients', 'email', 'orders+ingredients@example.test'),
    'EUR',
    5,
    'active',
    'Demo supplier for planning purchase-order examples.'
  )
on conflict (org_id, code) do update
  set name           = excluded.name,
      contact_jsonb  = excluded.contact_jsonb,
      currency       = excluded.currency,
      lead_time_days = excluded.lead_time_days,
      status         = excluded.status,
      notes          = excluded.notes,
      updated_at     = pg_catalog.now();
