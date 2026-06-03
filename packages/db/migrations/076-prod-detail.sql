-- Migration 076: 01-NPD-a T-002 prod_detail table + indexes.
-- PRD: docs/prd/01-NPD-PRD.md §4.3.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create table if not exists public.prod_detail (
  id uuid primary key default gen_random_uuid(),
  product_code text not null references public.product(product_code) on delete cascade,
  org_id uuid not null references public.organizations(id),
  intermediate_code text not null,
  component_index integer not null,
  manufacturing_operation_1 text,
  manufacturing_operation_2 text,
  manufacturing_operation_3 text,
  manufacturing_operation_4 text,
  operation_yield_1 numeric,
  operation_yield_2 numeric,
  operation_yield_3 numeric,
  operation_yield_4 numeric,
  line text,
  equipment_setup text,
  yield_line numeric,
  resource_requirement text,
  rate numeric,
  intermediate_code_p1 text,
  intermediate_code_p2 text,
  intermediate_code_p3 text,
  intermediate_code_p4 text,
  intermediate_code_final text,
  slice_count integer,
  component_weight numeric,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists prod_detail_product_code_idx
  on public.prod_detail (product_code);

create index if not exists prod_detail_org_product_code_idx
  on public.prod_detail (org_id, product_code);

alter table public.prod_detail enable row level security;
alter table public.prod_detail force row level security;

drop policy if exists prod_detail_org_context on public.prod_detail;
create policy prod_detail_org_context
  on public.prod_detail
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.prod_detail from public;
revoke all on public.prod_detail from app_user;
grant select, insert, update, delete on public.prod_detail to app_user;

comment on table public.prod_detail
  is 'T-002: per-component production detail rows for product manufacturing data.';
