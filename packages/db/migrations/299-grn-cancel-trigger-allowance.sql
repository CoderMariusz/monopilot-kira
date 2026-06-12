-- Migration 299: GRN-line cancellation allowance on completed GRNs (R3 F2).
--
-- mig-193's grn_items_block_completed_grn (V-WH-GRN-001) froze EVERY
-- insert/update/delete on grn_items once the owning GRN is completed or
-- cancelled. mig-298 added the receipt-line cancellation flags
-- (cancelled_at/cancelled_by/cancellation_reason_code/cancellation_note), but
-- cancelGrnLine could never write them on a completed GRN — the trigger
-- rejected the flag update wholesale.
--
-- This replaces the trigger function so that EXACTLY ONE shape of write is
-- allowed on a *completed* GRN: an UPDATE that transitions cancelled_at
-- NULL → NOT NULL and changes nothing else except the cancellation metadata
-- columns and the row-maintenance columns (updated_at/updated_by — set by the
-- same statement / touch triggers). The jsonb comparison is column-name based,
-- so any OTHER column change — qty, batch, uom, lp_id, re-cancel, un-cancel,
-- insert, delete — keeps the V-WH-GRN-001 block. *Cancelled* GRNs stay fully
-- frozen (no flag allowance).

create or replace function public.grn_items_block_completed_grn()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_flag_cols text[] := array[
    'cancelled_at',
    'cancelled_by',
    'cancellation_reason_code',
    'cancellation_note',
    'updated_at',
    'updated_by'
  ];
begin
  select g.status into v_status
    from public.grns g
   where g.id = coalesce(new.grn_id, old.grn_id);
  if v_status in ('completed', 'cancelled') then
    -- Sole allowance: first-time cancellation flag write on a COMPLETED GRN
    -- with every other column byte-identical.
    if tg_op = 'UPDATE'
       and v_status = 'completed'
       and old.cancelled_at is null
       and new.cancelled_at is not null
       and (to_jsonb(old) - v_flag_cols) = (to_jsonb(new) - v_flag_cols)
    then
      return new;
    end if;
    raise exception 'V-WH-GRN-001: grn_items are frozen once the GRN is % (grn_id=%)',
      v_status, coalesce(new.grn_id, old.grn_id);
  end if;
  return coalesce(new, old);
end;
$$;
