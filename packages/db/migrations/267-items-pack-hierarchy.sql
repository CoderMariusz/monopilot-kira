-- Migration 267: P0 UOM / pack hierarchy backend.
-- Product decision: FG pack hierarchy lives on items; WOs snapshot it at release/create.
-- Wave0 lock: org_id is the business scope (NOT tenant_id); existing RLS remains in force.

alter table public.items
  add column if not exists output_uom text not null default 'base',
  add column if not exists net_qty_per_each numeric(12, 4),
  add column if not exists each_per_box integer,
  add column if not exists boxes_per_pallet integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.items'::regclass
       and conname = 'items_output_uom_check'
  ) then
    alter table public.items
      add constraint items_output_uom_check
      check (output_uom in ('base', 'each', 'box'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.items'::regclass
       and conname = 'items_net_qty_per_each_positive_check'
  ) then
    alter table public.items
      add constraint items_net_qty_per_each_positive_check
      check (net_qty_per_each is null or net_qty_per_each > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.items'::regclass
       and conname = 'items_each_per_box_positive_check'
  ) then
    alter table public.items
      add constraint items_each_per_box_positive_check
      check (each_per_box is null or each_per_box > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.items'::regclass
       and conname = 'items_boxes_per_pallet_positive_check'
  ) then
    alter table public.items
      add constraint items_boxes_per_pallet_positive_check
      check (boxes_per_pallet is null or boxes_per_pallet > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.items'::regclass
       and conname = 'items_output_uom_pack_factors_check'
  ) then
    alter table public.items
      add constraint items_output_uom_pack_factors_check
      check (
        (output_uom <> 'each' or net_qty_per_each is not null)
        and (output_uom <> 'box' or (net_qty_per_each is not null and each_per_box is not null))
      );
  end if;
end $$;

alter table public.work_orders
  add column if not exists qty_entered numeric(14, 3),
  add column if not exists qty_entered_uom text,
  add column if not exists uom_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.work_orders'::regclass
       and conname = 'work_orders_qty_entered_uom_check'
  ) then
    alter table public.work_orders
      add constraint work_orders_qty_entered_uom_check
      check (qty_entered_uom is null or qty_entered_uom in ('base', 'each', 'box'));
  end if;
end $$;

alter table public.wo_outputs
  add column if not exists qty_units numeric(14, 3),
  add column if not exists units_uom text,
  add column if not exists actual_weight_kg numeric(14, 3);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.wo_outputs'::regclass
       and conname = 'wo_outputs_units_uom_check'
  ) then
    alter table public.wo_outputs
      add constraint wo_outputs_units_uom_check
      check (units_uom is null or units_uom in ('each', 'box'));
  end if;
end $$;

update public.items
   set output_uom = 'each',
       net_qty_per_each = 0.5
 where item_code like 'FG-%'
   and uom_base = 'kg'
   and net_qty_per_each is null
   and org_id = '00000000-0000-0000-0000-000000000002'::uuid;
