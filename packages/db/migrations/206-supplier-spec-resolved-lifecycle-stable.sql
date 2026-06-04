-- Migration 206: 03-technical Gate-4 corrective — re-declare
-- public.supplier_spec_resolved_lifecycle(text, date) as STABLE (was IMMUTABLE).
-- PRD: docs/prd/03-TECHNICAL-PRD.md §6 (supplier specs, RM-usability gate).
--
-- ROOT CAUSE: migration 174 (174-supplier-specs-phase1-governance.sql:124-138) declared the
-- effective-lifecycle resolver `language sql IMMUTABLE`, but its body depends on `current_date`
-- (174:133). An IMMUTABLE function MUST return the same output for the same arguments forever;
-- one that reads the clock violates that contract. The planner may then cache/fold the result
-- (e.g. in a constant-folded expression or a functional index expression) and serve a stale
-- "active vs expired" verdict — a wrong answer on a regulated RM-usability gate. The correct
-- volatility for a function that reads `current_date` is STABLE (constant within a single
-- statement scan, recomputed per statement).
--
-- This is a CLEAN corrective: it `create or replace`s the function with the IDENTICAL body
-- (copied verbatim from 174), changing ONLY IMMUTABLE -> STABLE. No signature change, no
-- behavioural change beyond correct caching semantics. Idempotent (create or replace).
-- Wave0 lock: no org_id surface here (pure value resolver); RLS unaffected.

create or replace function public.supplier_spec_resolved_lifecycle(
  p_lifecycle_status text,
  p_expiry_date date
)
returns text
language sql
stable
as $$
  select case
    when p_expiry_date is not null and p_expiry_date < current_date
         and p_lifecycle_status in ('draft', 'active')
      then 'expired'
    else p_lifecycle_status
  end;
$$;

comment on function public.supplier_spec_resolved_lifecycle(text, date) is
  'Resolve the EFFECTIVE supplier_spec lifecycle status: an active/draft spec whose expiry_date is in the past is reported as expired (AC2). STABLE (reads current_date) — corrected from IMMUTABLE by migration 206.';
