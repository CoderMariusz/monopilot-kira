-- Migration 508: 11-Shipping — RMA requests + lines (T-026 / C112).
-- Wave0 lock: org_id; RLS via app.current_org_id().
-- Idempotent, additive, live-safe. FK blocks separated from ADD COLUMN.

create sequence if not exists public.rma_seq start 1;

create or replace function public.shipping_set_rma_number()
returns trigger language plpgsql as $$
begin
  if new.rma_number is null then
    new.rma_number := 'RMA-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.rma_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

create table if not exists public.rma_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  site_id           uuid,
  rma_seq           bigint not null default nextval('public.rma_seq'),
  rma_number        text,
  customer_id       uuid not null,
  sales_order_id    uuid,
  shipment_id       uuid,
  reason_code       text not null,
  status            text not null default 'pending',
  total_value_gbp   numeric(14, 2),
  disposition       text,
  notes             text,
  approved_at       timestamptz,
  approved_by       uuid,
  received_at       timestamptz,
  received_by       uuid,
  processed_at      timestamptz,
  processed_by      uuid,
  closed_at         timestamptz,
  closed_by         uuid,
  ext_data          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default pg_catalog.now(),
  created_by        uuid,
  updated_at        timestamptz not null default pg_catalog.now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  constraint rma_requests_status_check check (
    status in ('pending', 'approved', 'receiving', 'received', 'processed', 'closed')
  ),
  constraint rma_requests_disposition_check check (
    disposition is null or disposition in ('restock', 'scrap', 'quality_hold')
  ),
  constraint rma_requests_reason_code_nonblank check (length(btrim(reason_code)) > 0)
);

create unique index if not exists rma_requests_org_number_uq on public.rma_requests (org_id, rma_number);
create index if not exists rma_requests_org_idx on public.rma_requests (org_id);
create index if not exists rma_requests_org_site_idx on public.rma_requests (org_id, site_id);
create index if not exists rma_requests_customer_idx on public.rma_requests (customer_id);
create index if not exists rma_requests_so_idx on public.rma_requests (sales_order_id);
create index if not exists rma_requests_shipment_idx on public.rma_requests (shipment_id);
create index if not exists rma_requests_status_idx on public.rma_requests (org_id, status);

create table if not exists public.rma_lines (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null,
  site_id             uuid,
  rma_request_id      uuid not null,
  product_id          uuid not null,
  quantity_expected   numeric(14, 3) not null,
  quantity_received   numeric(14, 3) not null default 0,
  lot_number          text,
  reason_notes        text,
  disposition         text,
  unit_price_gbp      numeric(14, 4),
  created_at          timestamptz not null default pg_catalog.now(),
  created_by          uuid,
  updated_at          timestamptz not null default pg_catalog.now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  constraint rma_lines_qty_expected_positive check (quantity_expected > 0),
  constraint rma_lines_qty_received_nonneg check (quantity_received >= 0),
  constraint rma_lines_disposition_check check (
    disposition is null or disposition in ('restock', 'scrap', 'quality_hold')
  )
);

create index if not exists rma_lines_org_idx on public.rma_lines (org_id);
create index if not exists rma_lines_request_idx on public.rma_lines (rma_request_id);

-- FK block (separate from CREATE TABLE for idempotency).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rma_requests_org_id_fkey'
  ) then
    alter table public.rma_requests
      add constraint rma_requests_org_id_fkey
      foreign key (org_id) references public.organizations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rma_requests_customer_id_fkey'
  ) then
    alter table public.rma_requests
      add constraint rma_requests_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rma_requests_sales_order_id_fkey'
  ) then
    alter table public.rma_requests
      add constraint rma_requests_sales_order_id_fkey
      foreign key (sales_order_id) references public.sales_orders(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rma_requests_shipment_id_fkey'
  ) then
    alter table public.rma_requests
      add constraint rma_requests_shipment_id_fkey
      foreign key (shipment_id) references public.shipments(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rma_lines_org_id_fkey'
  ) then
    alter table public.rma_lines
      add constraint rma_lines_org_id_fkey
      foreign key (org_id) references public.organizations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rma_lines_rma_request_id_fkey'
  ) then
    alter table public.rma_lines
      add constraint rma_lines_rma_request_id_fkey
      foreign key (rma_request_id) references public.rma_requests(id) on delete cascade;
  end if;
end $$;

drop trigger if exists rma_requests_set_number on public.rma_requests;
create trigger rma_requests_set_number
  before insert on public.rma_requests
  for each row execute function public.shipping_set_rma_number();

drop trigger if exists rma_requests_set_updated_at on public.rma_requests;
create trigger rma_requests_set_updated_at
  before update on public.rma_requests
  for each row execute function public.shipping_set_updated_at();

drop trigger if exists rma_lines_set_updated_at on public.rma_lines;
create trigger rma_lines_set_updated_at
  before update on public.rma_lines
  for each row execute function public.shipping_set_updated_at();

alter table public.rma_requests enable row level security;
alter table public.rma_requests force row level security;
alter table public.rma_lines enable row level security;
alter table public.rma_lines force row level security;

drop policy if exists rma_requests_org_context_select on public.rma_requests;
create policy rma_requests_org_context_select on public.rma_requests
  for select to app_user using (org_id = app.current_org_id());

drop policy if exists rma_requests_org_context_insert on public.rma_requests;
create policy rma_requests_org_context_insert on public.rma_requests
  for insert to app_user with check (org_id = app.current_org_id());

drop policy if exists rma_requests_org_context_update on public.rma_requests;
create policy rma_requests_org_context_update on public.rma_requests
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists rma_requests_org_context_delete on public.rma_requests;
create policy rma_requests_org_context_delete on public.rma_requests
  for delete to app_user using (org_id = app.current_org_id());

drop policy if exists rma_lines_org_context_select on public.rma_lines;
create policy rma_lines_org_context_select on public.rma_lines
  for select to app_user using (org_id = app.current_org_id());

drop policy if exists rma_lines_org_context_insert on public.rma_lines;
create policy rma_lines_org_context_insert on public.rma_lines
  for insert to app_user with check (org_id = app.current_org_id());

drop policy if exists rma_lines_org_context_update on public.rma_lines;
create policy rma_lines_org_context_update on public.rma_lines
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists rma_lines_org_context_delete on public.rma_lines;
create policy rma_lines_org_context_delete on public.rma_lines
  for delete to app_user using (org_id = app.current_org_id());

revoke all on public.rma_requests from public;
revoke all on public.rma_lines from public;
grant select, insert, update, delete on public.rma_requests to app_user;
grant select, insert, update, delete on public.rma_lines to app_user;
