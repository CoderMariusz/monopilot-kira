-- Migration 262: Planning procurement backbone — purchase orders.
--
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().
-- PO headers resolve to public.suppliers (migration 261); line items resolve to
-- the canonical public.items master.

create table if not exists public.purchase_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  po_number         text not null,
  supplier_id       uuid not null references public.suppliers(id) on delete restrict,
  status            text not null default 'draft',
  expected_delivery date,
  currency          text not null default 'EUR',
  notes             text,
  created_by        uuid references public.users(id) on delete set null,
  updated_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint purchase_orders_org_po_number_unique unique (org_id, po_number),
  constraint purchase_orders_status_check check (
    status in ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled')
  )
);

create table if not exists public.purchase_order_lines (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  po_id      uuid not null references public.purchase_orders(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete restrict,
  qty        numeric(12, 3) not null,
  uom        text not null,
  unit_price numeric(12, 4) not null default 0,
  line_no    integer not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint purchase_order_lines_org_po_line_unique unique (org_id, po_id, line_no),
  constraint purchase_order_lines_qty_positive_check check (qty > 0),
  constraint purchase_order_lines_unit_price_nonnegative_check check (unit_price >= 0),
  constraint purchase_order_lines_line_no_positive_check check (line_no > 0)
);

create index if not exists purchase_orders_org_status_idx on public.purchase_orders (org_id, status);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (org_id, supplier_id);
create index if not exists purchase_orders_expected_delivery_idx on public.purchase_orders (org_id, expected_delivery);
create index if not exists purchase_order_lines_org_po_idx on public.purchase_order_lines (org_id, po_id);
create index if not exists purchase_order_lines_item_idx on public.purchase_order_lines (org_id, item_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_orders force row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_lines force row level security;

drop policy if exists purchase_orders_org_context on public.purchase_orders;
create policy purchase_orders_org_context
  on public.purchase_orders
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists purchase_order_lines_org_context on public.purchase_order_lines;
create policy purchase_order_lines_org_context
  on public.purchase_order_lines
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.purchase_orders from public;
revoke all on public.purchase_orders from app_user;
revoke all on public.purchase_order_lines from public;
revoke all on public.purchase_order_lines from app_user;
grant select, insert, update, delete on public.purchase_orders to app_user;
grant select, insert, update, delete on public.purchase_order_lines to app_user;

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function public.planning_procurement_set_updated_at();

drop trigger if exists purchase_order_lines_set_updated_at on public.purchase_order_lines;
create trigger purchase_order_lines_set_updated_at
  before update on public.purchase_order_lines
  for each row execute function public.planning_procurement_set_updated_at();

with seeded_pos as (
  insert into public.purchase_orders
    (org_id, po_number, supplier_id, status, expected_delivery, currency, notes)
  select
    '00000000-0000-0000-0000-000000000002'::uuid,
    v.po_number,
    s.id,
    v.status,
    v.expected_delivery,
    'EUR',
    v.notes
  from (values
    ('PO-DEMO-0001', 'draft',     'SUP-DEMO-01', date '2026-06-18', 'Draft meat PO for planning procurement demo.'),
    ('PO-DEMO-0002', 'confirmed', 'SUP-PKG-01',  date '2026-06-20', 'Confirmed packaging PO for planning procurement demo.')
  ) as v(po_number, status, supplier_code, expected_delivery, notes)
  join public.suppliers s
    on s.org_id = '00000000-0000-0000-0000-000000000002'::uuid
   and s.code = v.supplier_code
  on conflict (org_id, po_number) do update
    set supplier_id       = excluded.supplier_id,
        status            = excluded.status,
        expected_delivery = excluded.expected_delivery,
        currency          = excluded.currency,
        notes             = excluded.notes,
        updated_at        = pg_catalog.now()
  returning id, org_id, po_number
)
insert into public.purchase_order_lines
  (org_id, po_id, item_id, qty, uom, unit_price, line_no)
select
  po.org_id,
  po.id,
  i.id,
  v.qty,
  i.uom_base,
  v.unit_price,
  v.line_no
from (values
  ('PO-DEMO-0001', 1, 'RM-BEEF-80',    500.000::numeric, 6.2000::numeric),
  ('PO-DEMO-0001', 2, 'ING-CURE-SALT',  25.000::numeric, 0.5500::numeric),
  ('PO-DEMO-0002', 1, 'PKG-TRAY-MAP', 2000.000::numeric, 0.0800::numeric),
  ('PO-DEMO-0002', 2, 'PKG-FOIL-MAP', 2000.000::numeric, 0.0500::numeric)
) as v(po_number, line_no, item_code, qty, unit_price)
join seeded_pos po on po.po_number = v.po_number
join public.items i
  on i.org_id = po.org_id
 and i.item_code = v.item_code
on conflict (org_id, po_id, line_no) do update
  set item_id    = excluded.item_id,
      qty        = excluded.qty,
      uom        = excluded.uom,
      unit_price = excluded.unit_price,
      updated_at = pg_catalog.now();
