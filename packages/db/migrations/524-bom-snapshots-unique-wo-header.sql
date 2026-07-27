-- 524-bom-snapshots-unique-wo-header.sql
-- PF-R06-11 (Fala 4 / FIX-T5): bom_snapshots idempotency key (org_id, work_order_id,
-- bom_header_id) was enforced only by a pre-insert SELECT in application code.
-- Concurrent WO-creation callers could both pass the SELECT and INSERT duplicate rows.
-- Production audit (2026-07-27): zero duplicates on this triple, zero NULL work_order_id
-- rows — safe to add UNIQUE without backfill.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD (converges when re-applied).
-- Does NOT touch the migration-159 immutability trigger or withheld UPDATE/DELETE
-- grants — UNIQUE is compatible with INSERT-only access.

alter table public.bom_snapshots
  drop constraint if exists bom_snapshots_org_wo_header_unique;

alter table public.bom_snapshots
  add constraint bom_snapshots_org_wo_header_unique
  unique (org_id, work_order_id, bom_header_id);

comment on constraint bom_snapshots_org_wo_header_unique on public.bom_snapshots is
  'ADR-002 idempotency: one immutable snapshot per (org, WO, BOM header). Migration 524.';

-- Post-check that actually EXERCISES the conflict path.
-- PREPARE does not validate function bodies; a catalog-only assertion would pass even
-- when concurrent INSERTs could still duplicate. Attempt a real duplicate INSERT and
-- require SQLSTATE 23505.
-- NOTE: SAVEPOINT / ROLLBACK TO SAVEPOINT are a SYNTAX ERROR inside PL/pgSQL — use a
-- nested begin … exception … end subtransaction (same pattern as migration 523).
do $$
declare
  v_id uuid;
  v_wo uuid;
  v_header uuid;
  v_org uuid;
  v_caught boolean := false;
begin
  select s.id, s.work_order_id, s.bom_header_id, s.org_id
    into v_id, v_wo, v_header, v_org
    from public.bom_snapshots s
   limit 1;

  if v_id is null then
    raise notice 'migration 524: no bom_snapshots row visible, duplicate probe skipped';
    return;
  end if;

  begin
    insert into public.bom_snapshots (org_id, work_order_id, bom_header_id, snapshot_json)
    values (v_org, v_wo, v_header, '{"probe":true}'::jsonb);
    raise exception 'migration 524 FAILED: duplicate insert succeeded (unique not enforced)';
  exception
    when unique_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'migration 524 FAILED: duplicate insert did not raise unique_violation';
  end if;

  raise notice 'migration 524: unique (org_id, work_order_id, bom_header_id) enforced';
end
$$;
