-- Migration 294: add 'destroyed' to the license_plates.status domain.
--
-- Wave R2 (voidWoOutput) needs a terminal state for pallets voided by an
-- output correction. The mig-191 CHECK lacked 'destroyed', yet app code has
-- referenced it in active-LP exclusion lists since wave 8 (scanner movement,
-- putaway suggestions: status NOT IN ('consumed','destroyed','shipped')) —
-- the domain was expected but never legal. Marking voided pallets 'consumed'
-- instead would pollute consumption semantics in genealogy/inventory reports.
--
-- Idempotent: drop-if-exists + re-add (NOT VALID -> VALIDATE, no long lock on
-- a busy table; existing rows all use already-legal values).

alter table public.license_plates
  drop constraint if exists license_plates_status_check;

alter table public.license_plates
  add constraint license_plates_status_check
  check (status in (
    'received', 'available', 'reserved', 'allocated', 'consumed',
    'blocked', 'merged', 'shipped', 'returned', 'quarantine', 'destroyed'
  )) not valid;

alter table public.license_plates
  validate constraint license_plates_status_check;

comment on constraint license_plates_status_check on public.license_plates is
  'LP status domain. ''destroyed'' (mig 294) = terminal state for pallets voided by an output correction (Wave R2) — distinct from ''consumed'' (used in production).';
