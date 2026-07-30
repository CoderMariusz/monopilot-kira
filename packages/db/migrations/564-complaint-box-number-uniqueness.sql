-- Migration 564 — document numbering stops producing silent duplicates.
--
-- PROBLEM (proven by a real two-session interleave, not by reading code)
--   Two writers computed the next number with `max(...) + 1` and both inserted:
--     * public.complaints      → CMP-00000001 twice
--     * public.shipment_boxes  → box_number 1 twice in one shipment (two identical labels)
--   The advisory lock in the complaints CTE does not help: under READ COMMITTED the
--   statement snapshot is taken BEFORE the lock wait finishes, so max() cannot see the
--   other session's fresh commit. Only a unique constraint is authoritative here — the
--   same conclusion goods receipts already reached (grns_org_grn_number_uq, mig 193),
--   where the second writer got a clean error instead of a duplicate.
--
-- FIX
--   1. Resolve any duplicates that already exist (a constraint will not install otherwise).
--   2. complaints      → UNIQUE (org_id, complaint_number)              [no soft delete on this table]
--   3. shipment_boxes  → UNIQUE (org_id, shipment_id, box_number) WHERE deleted_at is null
--
--   The WHERE clause on shipment_boxes is load-bearing: the table soft-deletes
--   (deleted_at) and the numbering query itself only counts `deleted_at is null` rows,
--   so an unconditional constraint would make box number N permanently unusable after
--   box N was deleted — the app would then loop forever on a number it can never take.
--   complaints has no deleted_at column, so a plain table constraint is correct there.
--
--   Retry-on-23505 lives in the callers (complaint-actions.ts, pack-lp-into-box.ts):
--   the constraint alone would only turn a silent duplicate into a user-visible error.

-- ---------------------------------------------------------------------------
-- 1a. Renumber pre-existing duplicate complaint numbers (keep the oldest row).
-- ---------------------------------------------------------------------------
with dupes as (
  select id,
         org_id,
         row_number() over (
           partition by org_id, complaint_number
           order by created_at asc, id asc
         ) as rn
    from public.complaints
),
org_max as (
  select org_id,
         coalesce(max(substring(complaint_number from '^CMP-([0-9]+)$')::int), 0) as max_seq
    from public.complaints
   where complaint_number ~ '^CMP-[0-9]+$'
   group by org_id
),
renumber as (
  select d.id,
         om.max_seq + row_number() over (partition by d.org_id order by d.id) as new_seq
    from dupes d
    join org_max om on om.org_id = d.org_id
   where d.rn > 1
)
update public.complaints c
   set complaint_number = 'CMP-' || lpad(r.new_seq::text, 8, '0')
  from renumber r
 where c.id = r.id;

-- ---------------------------------------------------------------------------
-- 1b. Renumber pre-existing duplicate box numbers among LIVE boxes only.
-- ---------------------------------------------------------------------------
with dupes as (
  select id,
         org_id,
         shipment_id,
         row_number() over (
           partition by org_id, shipment_id, box_number
           order by created_at asc, id asc
         ) as rn
    from public.shipment_boxes
   where deleted_at is null
),
shipment_max as (
  select org_id, shipment_id, coalesce(max(box_number), 0) as max_no
    from public.shipment_boxes
   where deleted_at is null
   group by org_id, shipment_id
),
renumber as (
  select d.id,
         sm.max_no + row_number() over (partition by d.org_id, d.shipment_id order by d.id) as new_no
    from dupes d
    join shipment_max sm
      on sm.org_id = d.org_id and sm.shipment_id = d.shipment_id
   where d.rn > 1
)
update public.shipment_boxes b
   set box_number = r.new_no
  from renumber r
 where b.id = r.id;

-- ---------------------------------------------------------------------------
-- 2. complaints: (org_id, complaint_number) unique.
-- ---------------------------------------------------------------------------
create unique index if not exists complaints_org_complaint_number_uq
  on public.complaints (org_id, complaint_number);

-- ---------------------------------------------------------------------------
-- 3. shipment_boxes: (org_id, shipment_id, box_number) unique among live rows.
-- ---------------------------------------------------------------------------
create unique index if not exists shipment_boxes_org_shipment_box_number_uq
  on public.shipment_boxes (org_id, shipment_id, box_number)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Post-check: PREPARE does not validate anything here, so assert the real state.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public' and indexname = 'complaints_org_complaint_number_uq'
  ) then
    raise exception 'mig564: complaints_org_complaint_number_uq missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public'
       and indexname = 'shipment_boxes_org_shipment_box_number_uq'
       and indexdef ilike '%WHERE (deleted_at IS NULL)%'
  ) then
    raise exception 'mig564: shipment_boxes partial unique index missing or not partial';
  end if;
end $$;
