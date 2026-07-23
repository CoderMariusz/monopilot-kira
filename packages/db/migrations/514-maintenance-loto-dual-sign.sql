-- Migration 514: 13-Maintenance — atomic LOTO zero-energy dual-sign receipts.
--
-- Existing in-progress rows are intentionally left untouched. New application
-- writes persist both actors and both immutable e_sign_log receipts atomically;
-- the Start MWO gate validates the complete pair under app.current_org_id().

alter table public.mwo_loto_checklists
  add column if not exists lockout_applied_by uuid references public.users(id) on delete restrict,
  add column if not exists lockout_signature_id uuid references public.e_sign_log(signature_id) on delete restrict,
  add column if not exists zero_energy_signature_id uuid references public.e_sign_log(signature_id) on delete restrict;

alter table public.mwo_loto_checklists
  drop constraint if exists mwo_loto_checklists_lockout_dual_sign_check;

alter table public.mwo_loto_checklists
  add constraint mwo_loto_checklists_lockout_dual_sign_check
  check (
    (
      lockout_applied_by is null
      and lockout_signature_id is null
      and zero_energy_signature_id is null
    )
    or (
      lockout_applied_by is not null
      and zero_energy_verified_by is not null
      and lockout_applied_by <> zero_energy_verified_by
      and lockout_signature_id is not null
      and zero_energy_signature_id is not null
      and lockout_signature_id <> zero_energy_signature_id
      and verified_at is not null
    )
  );

comment on column public.mwo_loto_checklists.lockout_applied_by is
  'Primary LOTO applicator; must differ from zero_energy_verified_by.';
comment on column public.mwo_loto_checklists.lockout_signature_id is
  'Primary mnt.loto.lockout e-sign receipt.';
comment on column public.mwo_loto_checklists.zero_energy_signature_id is
  'Independent zero-energy verifier mnt.loto.lockout e-sign receipt.';
