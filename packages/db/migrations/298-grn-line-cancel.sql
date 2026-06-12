-- Migration 298: receipt-line cancellation flag.
--
-- grn_items.received_qty is constrained non-negative, so receipt correction
-- uses a status flag instead of a signed counter-row.

alter table public.grn_items
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null,
  add column if not exists cancellation_reason_code text,
  add column if not exists cancellation_note text;

create index if not exists grn_items_po_line_active_idx
  on public.grn_items (org_id, po_line_id)
  where po_line_id is not null and cancelled_at is null;

comment on column public.grn_items.cancelled_at is
  'Receipt-line correction flag. Cancelled rows remain immutable receipt evidence but are excluded from PO received aggregates.';

comment on column public.grn_items.cancelled_by is
  'User who cancelled this GRN line correction.';

comment on column public.grn_items.cancellation_reason_code is
  'Correction reason code supplied when cancelling this GRN line.';
