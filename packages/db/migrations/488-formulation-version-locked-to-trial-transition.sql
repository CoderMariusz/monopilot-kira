-- Migration 488: allow locked formulation versions to transition to submitted_for_trial.
-- Submit-for-trial (submit-for-trial.ts) does locked -> submitted_for_trial, but the
-- enforce_state_transition trigger only permitted locked -> draft, so EVERY submit threw
-- 'locked formulation versions can only transition to draft (unlock)' -> persistence_failed
-- (surfaced as "Could not submit for trial"). Idempotent create-or-replace; no data change.

create or replace function public.formulation_versions_enforce_state_transition()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    -- a locked version may unlock to draft OR advance to submitted_for_trial
    if old.state = 'locked' and new.state not in ('draft', 'submitted_for_trial') then
      raise exception 'locked formulation versions can only transition to draft (unlock) or submitted_for_trial';
    end if;
    if old.state = 'submitted_for_trial' and new.state = 'draft' then
      raise exception 'formulation versions cannot transition from submitted_for_trial to draft';
    end if;
  end if;
  return new;
end;
$$;
