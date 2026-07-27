-- 523-routing-setup-time-numeric-scale.sql
-- PF-R06-09 (Fala 4 / T3a): routing_operations.setup_time_min was `integer`
-- (migration 163) while run_time_per_unit_sec and cost_per_hour were widened to
-- numeric(18,6) by migration 503 — the same domain gap, one column later.
-- R-4 correction: 503's columns really did ROUND (numeric(10,2) rounds 3.333333
-- on assignment); an `integer` setup_time_min never got that far. `pg` sends every
-- bind parameter as TEXT, so '12.345' bound as $6::integer fails with an int4
-- input error, and the UI blocked the value even earlier (type="number" with an
-- implicit step=1 → stepMismatch, then Zod `.int()`). The defect was a fractional
-- changeover being unstorable, not a silently rounded one.
-- Fractional setup minutes are a real domain value (a 12.345 min changeover), so
-- the column follows 503.
--
-- Idempotent: ALTER ... TYPE to the type the column already has converges, which
-- is exactly the shape migration 503 uses. The non-negative CHECK
-- (routing_operations_setup_time_nonnegative_check) and the DEFAULT are carried
-- over by ALTER TYPE — neither is dropped or re-created here.
-- No view depends on routing_operations, so this cannot hit the 0A000
-- "cannot alter type of a column used by a view" trap.

alter table public.routing_operations
  alter column setup_time_min type numeric(18, 6);

comment on column public.routing_operations.setup_time_min is
  'Setup/changeover duration in minutes (numeric 18,6 — max 6 decimal places; migration 523).';

-- Post-check that actually EXERCISES the write path.
-- PREPARE (`begin; \i mig; rollback;`) does not validate anything that merely
-- sits in a function body, and a catalog-only assertion would still pass if a
-- fractional write rounded. So this block writes a 6 dp value through the real
-- column and reads it back.
--
-- R-1: the probe writes to a routing it CREATES ITSELF, never to a business row.
-- The previous version picked `select id from routing_operations limit 1` with no
-- ORDER BY and updated that row. Migration 496 hangs
-- `routing_operations_guard_locked_routing` (BEFORE INSERT OR UPDATE OR DELETE)
-- on that table, which raises `routing_operations_immutable (V-TEC-64)` (SQLSTATE
-- 23514) whenever the parent routing is locked. The handler below re-raises
-- everything except its own sentinel, so that error would have rolled the whole
-- migration back and failed the deploy — and which row `limit 1` returned was a
-- coin toss (production holds draft, active AND superseded operations, and two
-- consecutive probes on production returned rows of different status).
-- A routing this block creates is always `draft`, so the guard is a no-op, the
-- probe is deterministic, and nothing anyone owns is touched.
--
-- NOTE: SAVEPOINT / ROLLBACK TO SAVEPOINT are a SYNTAX ERROR inside PL/pgSQL.
-- The nested `begin ... exception ... end` below IS the subtransaction; raising
-- the sentinel exception unwinds the whole scaffold (routing + operation),
-- leaving the ALTER intact. `routing_operations.routing_id` is ON DELETE CASCADE
-- but nothing has to be deleted by hand: the subtransaction rollback discards
-- both inserts.
do $$
declare
  v_probe constant numeric := 12.345678;
  v_scale integer;
  v_org uuid;
  v_item uuid;
  v_line uuid;
  v_routing uuid;
  v_stored numeric;
begin
  select numeric_scale into v_scale
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'routing_operations'
     and column_name = 'setup_time_min';
  if v_scale is distinct from 6 then
    raise exception 'migration 523 FAILED: setup_time_min scale is % (expected 6)', v_scale;
  end if;

  -- routings is NOT NULL + FK on org_id and item_id, so the scaffold borrows an
  -- existing (org, item) pair — READ ONLY, and deterministic (ORDER BY id).
  select i.org_id, i.id
    into v_org, v_item
    from public.items i
   order by i.id
   limit 1;

  -- routing_operations also carries CHECK (line_id IS NOT NULL) plus an FK to
  -- production_lines, so the scaffold needs a real line too — borrowed read-only
  -- from the same org, deterministic (ORDER BY id). Without this the probe insert
  -- dies on routing_operations_line_required_check, which PREPARE caught.
  if v_org is not null then
    select pl.id into v_line
      from public.production_lines pl
     where pl.org_id = v_org
     order by pl.id
     limit 1;
  end if;

  if v_item is null or v_line is null then
    -- Fresh database with no org data yet (local `pnpm db:up`, CI). There is no
    -- legal (org_id, item_id) to hang a routing on — but a silent skip would be
    -- a post-check that proves nothing, so prove the behaviour on a clone of the
    -- real column instead. Same type, same CHECK constraints, no business table.
    create temp table routing_setup_time_probe_523
      (like public.routing_operations including defaults including constraints)
      on commit drop;
    -- LIKE copies CHECK constraints (so line_id IS NOT NULL still applies) but not
    -- foreign keys, so a synthetic line_id satisfies the clone without any FK target.
    insert into routing_setup_time_probe_523
      (org_id, routing_id, line_id, op_no, op_code, op_name, setup_time_min)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'PROBE-523', 'migration 523 write probe', v_probe);
    select setup_time_min into v_stored from routing_setup_time_probe_523;
    if v_stored is distinct from v_probe then
      raise exception 'migration 523 FAILED: setup_time_min stored % (expected %)', v_stored, v_probe;
    end if;
    drop table routing_setup_time_probe_523;
    raise notice 'migration 523: 6 dp round-trip proven on a clone of routing_operations (no org data or production line yet)';
    return;
  end if;

  begin
    insert into public.routings (org_id, item_id, version, status, effective_from)
    values (
      v_org,
      v_item,
      (select coalesce(max(r.version), 0) + 1
         from public.routings r
        where r.org_id = v_org and r.item_id = v_item),
      'draft',
      current_date
    )
    returning id into v_routing;

    insert into public.routing_operations
      (org_id, routing_id, line_id, op_no, op_code, op_name, setup_time_min)
    values (v_org, v_routing, v_line, 1, 'PROBE-523', 'migration 523 write probe', 0);

    -- The app writes setup minutes with UPDATE (update-routing replaces the set),
    -- so the probe exercises UPDATE, not just INSERT.
    update public.routing_operations
       set setup_time_min = v_probe
     where routing_id = v_routing
       and op_no = 1;
    if not found then
      raise exception 'migration 523 FAILED: probe operation was not written';
    end if;

    select setup_time_min into v_stored
      from public.routing_operations
     where routing_id = v_routing
       and op_no = 1;
    if v_stored is distinct from v_probe then
      raise exception 'migration 523 FAILED: setup_time_min stored % (expected %)', v_stored, v_probe;
    end if;

    raise notice 'migration 523: setup_time_min keeps 6 decimal places on write (probe routing %, rolled back)', v_routing;
    raise exception 'ROLLBACK_523_PROBE';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_523_PROBE' then
        raise;
      end if;
  end;
end
$$;
