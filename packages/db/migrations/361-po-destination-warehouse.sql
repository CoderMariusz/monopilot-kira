ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid REFERENCES public.warehouses(id);
