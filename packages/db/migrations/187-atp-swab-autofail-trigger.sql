-- Migration 187: 03-Technical T-026 — ATP swab auto-fail trigger (V-TEC-44) + outbox emit.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §10.6, §10.8 ; task _meta/atomic-tasks/03-technical/tasks/T-026.json
--
-- Wave0 lock: org_id is the business scope (the org, not a license/billing tier);
--             RLS via app.current_org_id().
--
-- CANONICAL-OWNER NOTE (do NOT cross): public.lab_results is QUALITY-OWNED
-- (migration 162). This trigger is a DB-LEVEL auto-fail guard that lives in the
-- 03-Technical migration set per the T-026 scope, but it does NOT introduce a
-- Technical write/approve path — it only enforces the ATP cleaning-validation
-- threshold at INSERT/UPDATE time and emits an outbox event. The 08-PRODUCTION
-- WO-close gate is the DOWNSTREAM CONSUMER of that event; this migration only
-- EMITS (red-line: "Do not consume the event here").
--
-- What it does (V-TEC-44):
--   When a lab_results row with test_type='atp_swab' has a result_value that
--   exceeds the org's ATP RLU threshold, the row's result_status is forced to
--   'fail' (BEFORE INSERT/UPDATE) and a 'quality.atp_swab_failed' outbox event
--   is emitted (AFTER INSERT/UPDATE) with payload
--     { item_id, work_order_id, test_code, result_value, threshold_rlu }.
--
-- Threshold resolution (precedence):
--   1. the row's own threshold_rlu column when provided (per-row override), else
--   2. the org's "Reference"."AlertThresholds" row_key='atp_swab_rlu_max'
--      (value_int; default 10 seeded by migration 167), else
--   3. the hard fallback 10 RLU (matches the column DEFAULT in migration 162).
--
-- The event_type 'quality.atp_swab_failed' is registered in the AUTHORITATIVE
-- enum (packages/outbox/src/events.enum.ts) and the DB CHECK is regenerated from
-- it in migration 189 (drift gate stays green). `quality.*` is the registered
-- aggregate prefix for swab events per _meta/specs/event-naming-convention.md.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + recreate.
-- d365 is never the system of record; no D365 hard FK is introduced.

-- ============================================================================
-- 1. Threshold resolver — STABLE, runs as the inserting role so the
--    AlertThresholds RLS SELECT is org-scoped by the active app.current_org_id().
-- ============================================================================
create or replace function public.atp_swab_threshold_rlu(p_org_id uuid, p_row_threshold numeric)
returns numeric
language plpgsql
stable
as $$
declare
  v_threshold numeric;
begin
  -- 1. per-row override wins.
  if p_row_threshold is not null then
    return p_row_threshold;
  end if;

  -- 2. org-level configured threshold from Reference.AlertThresholds.
  select at.value_int
    into v_threshold
    from "Reference"."AlertThresholds" at
   where at.org_id = p_org_id
     and at.threshold_key = 'atp_swab_rlu_max';

  if v_threshold is not null then
    return v_threshold;
  end if;

  -- 3. hard fallback (matches lab_results.threshold_rlu default in migration 162).
  return 10::numeric;
end;
$$;

revoke all on function public.atp_swab_threshold_rlu(uuid, numeric) from public;
grant execute on function public.atp_swab_threshold_rlu(uuid, numeric) to app_user;

-- ============================================================================
-- 2. BEFORE trigger — auto-fail status when ATP swab result exceeds threshold.
--    Only touches test_type='atp_swab' rows; everything else passes through
--    unmodified (red-line: allergen_elisa/pass must NOT be rewritten).
-- ============================================================================
create or replace function public.lab_results_atp_autofail()
returns trigger
language plpgsql
as $$
declare
  v_threshold numeric;
begin
  if new.test_type <> 'atp_swab' then
    return new;
  end if;

  -- No measured value → cannot auto-fail; leave caller-provided status intact.
  if new.result_value is null then
    return new;
  end if;

  v_threshold := public.atp_swab_threshold_rlu(new.org_id, new.threshold_rlu);

  -- Persist the resolved threshold so downstream consumers + the AFTER trigger
  -- payload see the value the decision was made against.
  new.threshold_rlu := v_threshold;

  -- Over threshold (strictly greater than; ≤ threshold passes per §10.6) → fail.
  if new.result_value > v_threshold then
    new.result_status := 'fail';
  end if;

  return new;
end;
$$;

drop trigger if exists lab_results_atp_autofail on public.lab_results;
create trigger lab_results_atp_autofail
  before insert or update on public.lab_results
  for each row execute function public.lab_results_atp_autofail();

-- ============================================================================
-- 3. AFTER trigger — emit 'quality.atp_swab_failed' outbox event on auto-fail.
--    Runs in the SAME transaction as the lab_results write (transactional
--    outbox). org_id is taken from the row; the outbox RLS INSERT policy checks
--    org_id = app.current_org_id(), which is the active org context.
-- ============================================================================
create or replace function public.lab_results_atp_emit_fail()
returns trigger
language plpgsql
as $$
begin
  if new.test_type <> 'atp_swab' then
    return new;
  end if;

  if new.result_status is distinct from 'fail' then
    return new;
  end if;

  -- On UPDATE, only emit when the row TRANSITIONS into fail (avoid duplicate
  -- events when an already-failed row is touched for unrelated reasons).
  if tg_op = 'UPDATE' and old.result_status is not distinct from 'fail' then
    return new;
  end if;

  insert into public.outbox_events
    (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  values (
    new.org_id,
    'quality.atp_swab_failed',
    'lab_result',
    new.id::text,
    jsonb_build_object(
      'item_id', new.item_id,
      'work_order_id', new.work_order_id,
      'test_code', new.test_code,
      'result_value', new.result_value,
      'threshold_rlu', new.threshold_rlu
    ),
    'technical-atp-autofail-v1'
  );

  return new;
end;
$$;

drop trigger if exists lab_results_atp_emit_fail on public.lab_results;
create trigger lab_results_atp_emit_fail
  after insert or update on public.lab_results
  for each row execute function public.lab_results_atp_emit_fail();

comment on function public.lab_results_atp_autofail() is
  'T-026 / V-TEC-44: forces result_status=fail when an ATP swab result_value exceeds '
  'the org ATP RLU threshold (per-row override -> Reference.AlertThresholds atp_swab_rlu_max -> 10).';
comment on function public.lab_results_atp_emit_fail() is
  'T-026: emits quality.atp_swab_failed outbox event when an ATP swab row transitions to fail. '
  'EMIT-ONLY -- the 08-PRODUCTION WO-close gate is the downstream consumer.';
