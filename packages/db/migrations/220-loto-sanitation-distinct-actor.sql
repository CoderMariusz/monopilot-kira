-- Migration 220: CFR-21/OSHA dual-sign distinct actor integrity.
--
-- Source migration read:
--   * 201-maintenance-schema-foundation.sql defines LOTO signers as
--     zero_energy_verified_by and released_by, and sanitation signers as
--     first_signed_by and second_signed_by.

alter table public.mwo_loto_checklists
  drop constraint if exists mwo_loto_checklists_distinct_signers_check;

alter table public.mwo_loto_checklists
  add constraint mwo_loto_checklists_distinct_signers_check
  check (
    zero_energy_verified_by is null
    or released_by is null
    or zero_energy_verified_by <> released_by
  );

alter table public.sanitation_checklists
  drop constraint if exists sanitation_checklists_distinct_signers_check;

alter table public.sanitation_checklists
  add constraint sanitation_checklists_distinct_signers_check
  check (
    first_signed_by is null
    or second_signed_by is null
    or first_signed_by <> second_signed_by
  );
