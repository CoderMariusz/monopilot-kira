-- 395-shipping-fks-and-nonneg-checks.sql
-- Integrity hardening (DB cleanup audit, section D).
-- Promote three shipping "soft FK" columns to real foreign keys (0 orphan rows confirmed
-- live before applying) and add the missing non-negative CHECKs on sales-order-line
-- quantity columns and customers.credit_limit_gbp.
-- product_id -> items.id: public.product is now a view (mig 359); items is the FG owner.

alter table public.sales_order_lines
  add constraint sales_order_lines_product_id_fkey
  foreign key (product_id) references public.items(id) on delete restrict;

alter table public.inventory_allocations
  add constraint inventory_allocations_license_plate_id_fkey
  foreign key (license_plate_id) references public.license_plates(id) on delete restrict;

-- shipment_box_contents.license_plate_id is nullable; match the table's existing
-- sales_order_line_id_fkey ON DELETE SET NULL behaviour.
alter table public.shipment_box_contents
  add constraint shipment_box_contents_license_plate_id_fkey
  foreign key (license_plate_id) references public.license_plates(id) on delete set null;

alter table public.sales_order_lines
  add constraint sales_order_lines_qty_allocated_nonneg check (quantity_allocated >= 0),
  add constraint sales_order_lines_qty_picked_nonneg    check (quantity_picked >= 0),
  add constraint sales_order_lines_qty_packed_nonneg    check (quantity_packed >= 0),
  add constraint sales_order_lines_qty_shipped_nonneg   check (quantity_shipped >= 0);

alter table public.customers
  add constraint customers_credit_limit_nonneg
  check (credit_limit_gbp is null or credit_limit_gbp >= 0);
