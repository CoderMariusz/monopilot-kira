-- Migration 288: 11-Shipping — CX1 sales-order core compatibility layer.
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().
--
-- Migration 211 already creates the broader shipping foundation in this repo
-- (customers, sales_orders, sales_order_lines, inventory_allocations). The
-- CREATE TABLE IF NOT EXISTS blocks below keep this lane idempotent on scratch
-- databases while avoiding ownership churn on the existing 211 objects.

alter table public.org_document_settings
  drop constraint if exists org_document_settings_doc_type_check;

alter table public.org_document_settings
  add constraint org_document_settings_doc_type_check
  check (doc_type in ('po', 'to', 'wo', 'insp', 'so'));

insert into public.org_document_settings
  (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
select o.id, 'so', 'SO', 'YYYYMM', 5, 30
from public.organizations o
where not exists (
  select 1
  from public.org_document_settings existing
  where existing.org_id = o.id
    and existing.doc_type = 'so'
);

create or replace function public.seed_org_document_settings_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.org_document_settings
    (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
  select p_org_id, defaults.doc_type, defaults.number_prefix, defaults.number_date_part, defaults.number_seq_padding, 30
  from (values
    ('po', 'PO', 'YYYYMM', 4),
    ('to', 'TO', 'YYYYMM', 4),
    ('wo', 'WO', 'YYYYMM', 4),
    ('insp', 'INSP', 'none', 8),
    ('so', 'SO', 'YYYYMM', 5)
  ) as defaults(doc_type, number_prefix, number_date_part, number_seq_padding)
  where not exists (
    select 1
    from public.org_document_settings existing
    where existing.org_id = p_org_id
      and existing.doc_type = defaults.doc_type
  );
end;
$$;

revoke all on function public.seed_org_document_settings_for_org(uuid) from public;
revoke all on function public.seed_org_document_settings_for_org(uuid) from app_user;

create or replace function public.next_sales_order_document_number(p_org_id uuid)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_current_org_id uuid;
  v_old_seq bigint;
  v_prefix text;
  v_date_part text;
  v_padding integer;
  v_formatted_date text;
begin
  v_current_org_id := app.current_org_id();

  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22004';
  end if;

  if v_current_org_id is null or v_current_org_id <> p_org_id then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  update public.org_document_settings
     set next_seq = next_seq + 1
   where org_id = p_org_id
     and doc_type = 'so'
   returning next_seq - 1, number_prefix, number_date_part, number_seq_padding
    into v_old_seq, v_prefix, v_date_part, v_padding;

  if v_old_seq is null then
    insert into public.org_document_settings
      (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
    values (p_org_id, 'so', 'SO', 'YYYYMM', 5, 30)
    on conflict (org_id, doc_type) do nothing;

    update public.org_document_settings
       set next_seq = next_seq + 1
     where org_id = p_org_id
       and doc_type = 'so'
     returning next_seq - 1, number_prefix, number_date_part, number_seq_padding
      into v_old_seq, v_prefix, v_date_part, v_padding;
  end if;

  if v_old_seq is null then
    raise exception 'document_number_settings_missing:so'
      using errcode = 'P0001';
  end if;

  v_formatted_date := case v_date_part
    when 'YYYY' then to_char(pg_catalog.now(), 'YYYY')
    when 'YYYYMM' then to_char(pg_catalog.now(), 'YYYYMM')
    when 'YYYYMMDD' then to_char(pg_catalog.now(), 'YYYYMMDD')
    else null
  end;

  return array_to_string(
    array_remove(array[v_prefix, v_formatted_date, lpad(v_old_seq::text, v_padding, '0')], null),
    '-'
  );
end;
$$;

revoke all on function public.next_sales_order_document_number(uuid) from public;
grant execute on function public.next_sales_order_document_number(uuid) to app_user;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  code text not null,
  name text not null,
  address jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  so_number text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'allocated', 'shipped', 'cancelled')),
  customer_id uuid references public.customers(id),
  requested_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  unique (org_id, so_number)
);

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  so_id uuid not null references public.sales_orders(id) on delete cascade,
  line_no integer not null,
  item_id uuid not null references public.items(id),
  qty numeric(18, 6) not null check (qty > 0),
  uom text not null,
  allocated_qty numeric(18, 6) not null default 0 check (allocated_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (so_id, line_no)
);

create table if not exists public.sales_order_line_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  so_line_id uuid not null references public.sales_order_lines(id) on delete cascade,
  lp_id uuid not null references public.license_plates(id),
  qty numeric(18, 6) not null check (qty > 0),
  created_at timestamptz not null default now(),
  unique (so_line_id, lp_id)
);

create or replace function public.shipping_so_core_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

do $$
declare
  t text;
  managed_tables text[] := array[
    'customers',
    'sales_orders',
    'sales_order_lines',
    'sales_order_line_allocations'
  ];
begin
  foreach t in array managed_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_context', t);
    execute format(
      'create policy %I on public.%I for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())',
      t || '_org_context',
      t
    );
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from app_user', t);
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
  end loop;
end
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.shipping_so_core_set_updated_at();

drop trigger if exists sales_orders_set_updated_at on public.sales_orders;
create trigger sales_orders_set_updated_at
  before update on public.sales_orders
  for each row execute function public.shipping_so_core_set_updated_at();

drop trigger if exists sales_order_lines_set_updated_at on public.sales_order_lines;
create trigger sales_order_lines_set_updated_at
  before update on public.sales_order_lines
  for each row execute function public.shipping_so_core_set_updated_at();
