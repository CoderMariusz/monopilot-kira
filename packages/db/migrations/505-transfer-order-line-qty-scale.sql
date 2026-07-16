-- 505-transfer-order-line-qty-scale.sql
-- C060 / R10-03: transfer_order_lines.qty was numeric(12,3) (migration 263) —
-- six-decimal catch-weight quantities (e.g. 1.000001 kg) were rejected at
-- storage. Expand to numeric(18,6) for parity with license_plates.quantity and
-- transfer_order_line_lps.qty (migration 283).
-- Idempotent: ALTER TYPE is safe to re-run when already at target scale.

alter table public.transfer_order_lines
  alter column qty type numeric(18, 6);

comment on column public.transfer_order_lines.qty is
  'Line quantity in the line UoM (numeric 18,6 — max 6 decimal places).';
