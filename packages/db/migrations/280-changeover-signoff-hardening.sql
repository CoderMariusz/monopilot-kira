-- 280-changeover-signoff-hardening.sql
-- Wave 8b / Lane RF3 — C4 changeover review fixes (F2 status drift + F4 gate index).
--
-- (a) F2 normalize: the canonical write value for changeover_events.dual_sign_off_status
--     is 'complete' (the app's read-side mapStatus shim keeps accepting the legacy
--     'completed' spelling, but no row should persist it after this migration).
-- (b) F2 CHECK: lock the status domain to ('pending','first_signed','complete').
--     Added NOT VALID first, then VALIDATE, so a long-lived lock on a busy table is
--     avoided and any row the UPDATE somehow missed fails loudly at VALIDATE time
--     instead of poisoning the ADD CONSTRAINT.
-- (c) F4 partial index: the START allergen-changeover gate scans for OPEN
--     (not-complete) medium+ changeovers per line on every WO start; the predicate
--     dual_sign_off_status NOT IN ('complete','completed') implies <> 'complete',
--     so this partial index supports it. The gate block is intentionally UNBOUNDED
--     in time (BRCGS safety-first decision — the changeovers UI sign-off is the
--     only escape hatch), which makes the open-rows set the hot working set.
--
-- Idempotent: re-running normalizes zero rows, re-creates the same constraint
-- (drop if exists + add), and skips the existing index.

update public.changeover_events
   set dual_sign_off_status = 'complete'
 where dual_sign_off_status = 'completed';

alter table public.changeover_events
  drop constraint if exists changeover_events_signoff_status_check;
alter table public.changeover_events
  add constraint changeover_events_signoff_status_check
  check (dual_sign_off_status in ('pending', 'first_signed', 'complete'))
  not valid;
alter table public.changeover_events
  validate constraint changeover_events_signoff_status_check;

create index if not exists idx_changeover_open_signoff
  on public.changeover_events (line_id)
  where dual_sign_off_status <> 'complete';
