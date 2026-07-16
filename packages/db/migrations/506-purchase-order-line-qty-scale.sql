-- 506-purchase-order-line-qty-scale.sql
-- C098 / R17-01: purchase_order_lines.qty was numeric(12,3) (migration 262) —
-- six-decimal catch-weight quantities (e.g. 10.123456 kg) were rejected at
-- validation and truncated at storage. Expand to numeric(18,6) for parity with
-- transfer_order_lines.qty (505) and license_plates.quantity.
-- Idempotent: ALTER TYPE is safe to re-run when already at target scale.

alter table public.purchase_order_lines
  alter column qty type numeric(18, 6);

comment on column public.purchase_order_lines.qty is
  'Line quantity in the line UoM (numeric 18,6 — max 6 decimal places).';
