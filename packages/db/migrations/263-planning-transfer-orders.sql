-- Migration 263: Planning procurement backbone — transfer orders.
--
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().
-- Warehouse references are intentionally soft UUIDs: public.warehouses exists
-- from migration 042, but planning keeps transfer suggestions loosely coupled to
-- site/warehouse rollout ordering.

create table if not exists public.transfer_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  to_number         text not null,
  from_warehouse_id uuid,
  to_warehouse_id   uuid,
  status            text not null default 'draft',
  scheduled_date    date,
  notes             text,
  created_by        uuid references public.users(id) on delete set null,
  updated_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint transfer_orders_org_to_number_unique unique (org_id, to_number),
  constraint transfer_orders_status_check check (
    status in ('draft', 'in_transit', 'received', 'cancelled')
  ),
  constraint transfer_orders_distinct_warehouses_check check (
    from_warehouse_id is null or to_warehouse_id is null or from_warehouse_id <> to_warehouse_id
  )
);

create table if not exists public.transfer_order_lines (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  to_id      uuid not null references public.transfer_orders(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete restrict,
  qty        numeric(12, 3) not null,
  uom        text not null,
  line_no    integer not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint transfer_order_lines_org_to_line_unique unique (org_id, to_id, line_no),
  constraint transfer_order_lines_qty_positive_check check (qty > 0),
  constraint transfer_order_lines_line_no_positive_check check (line_no > 0)
);

create index if not exists transfer_orders_org_status_idx on public.transfer_orders (org_id, status);
create index if not exists transfer_orders_scheduled_date_idx on public.transfer_orders (org_id, scheduled_date);
create index if not exists transfer_orders_from_warehouse_idx on public.transfer_orders (org_id, from_warehouse_id);
create index if not exists transfer_orders_to_warehouse_idx on public.transfer_orders (org_id, to_warehouse_id);
create index if not exists transfer_order_lines_org_to_idx on public.transfer_order_lines (org_id, to_id);
create index if not exists transfer_order_lines_item_idx on public.transfer_order_lines (org_id, item_id);

alter table public.transfer_orders enable row level security;
alter table public.transfer_orders force row level security;
alter table public.transfer_order_lines enable row level security;
alter table public.transfer_order_lines force row level security;

drop policy if exists transfer_orders_org_context on public.transfer_orders;
create policy transfer_orders_org_context
  on public.transfer_orders
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists transfer_order_lines_org_context on public.transfer_order_lines;
create policy transfer_order_lines_org_context
  on public.transfer_order_lines
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.transfer_orders from public;
revoke all on public.transfer_orders from app_user;
revoke all on public.transfer_order_lines from public;
revoke all on public.transfer_order_lines from app_user;
grant select, insert, update, delete on public.transfer_orders to app_user;
grant select, insert, update, delete on public.transfer_order_lines to app_user;

drop trigger if exists transfer_orders_set_updated_at on public.transfer_orders;
create trigger transfer_orders_set_updated_at
  before update on public.transfer_orders
  for each row execute function public.planning_procurement_set_updated_at();

drop trigger if exists transfer_order_lines_set_updated_at on public.transfer_order_lines;
create trigger transfer_order_lines_set_updated_at
  before update on public.transfer_order_lines
  for each row execute function public.planning_procurement_set_updated_at();

with demo_warehouses as (
  select
    max(id) filter (where is_default) as default_warehouse_id,
    min(id) as first_warehouse_id,
    max(id) as last_warehouse_id
  from public.warehouses
  where org_id = '00000000-0000-0000-0000-000000000002'::uuid
),
seeded_tos as (
  insert into public.transfer_orders
    (org_id, to_number, from_warehouse_id, to_warehouse_id, status, scheduled_date, notes)
  select
    '00000000-0000-0000-0000-000000000002'::uuid,
    'TO-DEMO-0001',
    coalesce(default_warehouse_id, first_warehouse_id),
    case
      when last_warehouse_id is distinct from coalesce(default_warehouse_id, first_warehouse_id)
        then last_warehouse_id
      else null
    end,
    'draft',
    date '2026-06-19',
    'Draft internal transfer for planning procurement demo.'
  from demo_warehouses
  on conflict (org_id, to_number) do update
    set from_warehouse_id = excluded.from_warehouse_id,
        to_warehouse_id   = excluded.to_warehouse_id,
        status            = excluded.status,
        scheduled_date    = excluded.scheduled_date,
        notes             = excluded.notes,
        updated_at        = pg_catalog.now()
  returning id, org_id, to_number
)
insert into public.transfer_order_lines
  (org_id, to_id, item_id, qty, uom, line_no)
select
  tos.org_id,
  tos.id,
  i.id,
  v.qty,
  i.uom_base,
  v.line_no
from (values
  (1, 'RM-BEEF-50', 150.000::numeric),
  (2, 'PKG-BOX-CARTON', 300.000::numeric)
) as v(line_no, item_code, qty)
join seeded_tos tos on tos.to_number = 'TO-DEMO-0001'
join public.items i
  on i.org_id = tos.org_id
 and i.item_code = v.item_code
on conflict (org_id, to_id, line_no) do update
  set item_id    = excluded.item_id,
      qty        = excluded.qty,
      uom        = excluded.uom,
      updated_at = pg_catalog.now();
