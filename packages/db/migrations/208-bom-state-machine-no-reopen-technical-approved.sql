-- Migration 208: 03-technical Gate-4 corrective — BOM version state machine: forbid
-- technical_approved -> in_review (in-place re-open of an immutable approved version).
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §7.1, §7.4, §7.6. Task T-073.
--
-- ROOT CAUSE: migration 168 (168-bom-version-state-machine-clone-on-write.sql:79) allows
--   when 'technical_approved' then new.status in ('in_review', 'active', 'superseded', 'archived')
-- Re-opening an approved (immutable) version in place by moving it back to 'in_review' violates
-- the clone-on-write invariant: once a version reaches technical_approved it must only terminalize
-- (active/superseded/archived), never re-enter a working/review state. Any post-approval change
-- must create a NEW draft version via the clone-on-write helper public.bom_request_version_edit()
-- (168 §2), which inserts a fresh in_review version that supersedes the approved one — the
-- approved row is never mutated.
--
-- WHY THIS IS THE CLEAN INVARIANT FIX (verified, fix APPLIED — not skipped):
--   * The 090 content-lock trigger (bom_headers_reject_approved_content_update, 090:115-148)
--     already blocks all CONTENT-field changes on technical_approved/active rows, so the only
--     legal UPDATE on those rows is the lifecycle transition itself. Removing in_review from the
--     allowed set therefore closes the LAST in-place re-open path without affecting content edits.
--   * The canonical re-review flow is clone-on-write (a NEW in_review version), not reopening the
--     approved row. The 168 clone helper, the apps/web/packages services, and the T-073 test suite
--     all exercise that path; NOTHING in the codebase drives technical_approved -> in_review in
--     place, and no test asserts that transition is allowed. So it is NOT load-bearing.
--
-- This `create or replace`s the transition guard with the IDENTICAL body except that in_review is
-- removed from technical_approved's allowed set (active/superseded/archived retained). The trigger
-- itself is unchanged (still wired by 168); replacing the function is sufficient. Idempotent.
-- Wave0 lock: org_id business scope; the guard is org-agnostic (operates on status only).

create or replace function public.bom_headers_enforce_status_transition()
returns trigger
language plpgsql
as $$
declare
  v_ok boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_ok := case old.status
    when 'draft'              then new.status in ('in_review', 'technical_approved', 'active', 'archived')
    when 'in_review'          then new.status in ('draft', 'technical_approved', 'active', 'archived')
    -- 208: in_review REMOVED — an approved (immutable) version may only terminalize, never re-open
    -- in place. Post-approval edits must clone a NEW version via bom_request_version_edit().
    when 'technical_approved' then new.status in ('active', 'superseded', 'archived')
    when 'active'             then new.status in ('superseded', 'archived')
    when 'superseded'         then new.status in ('archived')
    when 'archived'           then false
    else false
  end;

  if not v_ok then
    raise exception
      'invalid BOM version status transition % -> % (clone-on-write: an immutable version may only terminalize, never re-open; create a new draft version instead)',
      old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.bom_headers_enforce_status_transition() is
  'T-073 (corrected by 208): BOM version state-machine guard. Allows only valid forward lifecycle transitions; an immutable technical_approved/active version may ONLY terminalize (active/superseded/archived) — it may NOT re-open to in_review/draft in place (clone-on-write via bom_request_version_edit). Complements the 090 content-immutability trigger.';
