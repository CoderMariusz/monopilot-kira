-- Migration 518: NPD trial-batch void (corrective withdrawal with an audit trail).
--
-- PF-R04-12: a persisted trial could only be Edit/Re-booked. `deleteTrialBatch`
-- hard-deletes, and only while result = 'pending', so a mistaken trial that had
-- already been graded (or accepted at G4) had no explicit reversal at all.
--
-- Trials are audited evidence, so the reversal is a status flag (mirrors
-- migration 298 grn_items.cancelled_*) rather than a DELETE: the row survives,
-- stays visible as withdrawn, and carries who / when / why.
--
-- Idempotent, additive only. No data is modified.

alter table public.trial_batches
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.users(id) on delete set null,
  add column if not exists void_reason_code text,
  add column if not exists void_note text;

-- A voided row must always carry its reason (who/when come from the columns
-- above plus the audit_events row written in the same transaction).
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'trial_batches_void_reason_present'
       and conrelid = 'public.trial_batches'::regclass
  ) then
    alter table public.trial_batches
      add constraint trial_batches_void_reason_present
      check (voided_at is null or coalesce(btrim(void_reason_code), '') <> '')
      not valid;
  end if;
end
$$;

comment on column public.trial_batches.voided_at is
  'Corrective-withdrawal flag. Voided trials remain immutable evidence, stay visible on the trial list marked as withdrawn, and can no longer be edited or re-booked.';

comment on column public.trial_batches.voided_by is
  'User who voided this trial batch.';

comment on column public.trial_batches.void_reason_code is
  'Reason code supplied when voiding (see TRIAL_VOID_REASON_CODES).';

comment on column public.trial_batches.void_note is
  'Optional free-text note captured alongside the void reason code.';
