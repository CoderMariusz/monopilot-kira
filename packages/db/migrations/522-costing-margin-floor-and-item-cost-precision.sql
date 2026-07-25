-- Migration 522 — PF-R05-05 / T2: advisory negative margins.
--
-- Drop the lower bound on costing_breakdowns.margin_pct. D10 says a negative margin
-- is advisory and must persist with status 'fail'; the legacy `>= -100` check made the
-- write fail outright whenever total cost exceeded 2x the target price, which surfaced
-- to the user as a bare `persistence_failed`. Clamping to -100 was rejected as a fix:
-- it would store a number that is not the margin and show it as one.
--
-- NOT in this migration: widening item_cost_history.cost_per_kg to numeric(18,6).
-- `ALTER TYPE` there fails with 0A000 because the view v_item_effective_cost depends
-- on the column, and that view is load-bearing for the NPD cost/currency read path.
-- Rebuilding it belongs in its own migration with its own proof. The overflow it would
-- guard against is latent (needs a near-zero wip_definitions.yield_pct), so it does not
-- block this finding. Tracked as a Fala 3 follow-up.

alter table public.costing_breakdowns
  drop constraint if exists costing_breakdowns_margin_pct_check;

alter table public.costing_breakdowns
  add constraint costing_breakdowns_margin_pct_check
  check (margin_pct <= 100);

do $$
declare
  v_org_id uuid;
  v_product_code text;
  v_breakdown_id uuid;
  v_margin_ok boolean;
begin
  -- Post-check that actually EXECUTES the thing it claims to prove: a margin below the
  -- legacy -100 floor must INSERT. (A previous migration in this repo passed PREPARE and
  -- failed in production because Postgres only validates SQL function bodies at call time.)
  -- The insert is unwound by a sentinel exception, which rolls back the implicit
  -- subtransaction. SAVEPOINT cannot be used here: PL/pgSQL rejects transaction commands.
  select cb.org_id, cb.product_code
    into v_org_id, v_product_code
    from public.costing_breakdowns cb
   limit 1;

  if v_org_id is null then
    raise notice '522: skipping margin_pct post-check (no costing_breakdowns seed row)';
  else
    v_margin_ok := false;
    begin
      insert into public.costing_breakdowns
        (org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur, params)
      values
        (v_org_id, v_product_code, '__migration_522_margin_postcheck__', 165.25, -3211.5737, 4.99, '{}'::jsonb)
      returning id into v_breakdown_id;

      v_margin_ok := (v_breakdown_id is not null);
      raise exception 'MIGRATION_522_PROBE_ROLLBACK';
    exception
      when others then
        -- Only the sentinel is swallowed. A real constraint violation must abort the
        -- migration, otherwise this post-check would be decoration.
        if sqlerrm <> 'MIGRATION_522_PROBE_ROLLBACK' then
          raise;
        end if;
    end;

    if not v_margin_ok then
      raise exception '522: margin_pct post-check insert returned null id';
    end if;

    raise notice '522: margin_pct post-check passed (-3211.5737)';
  end if;

  if exists (
    select 1
      from pg_constraint
     where conname = 'costing_breakdowns_margin_pct_check'
       and pg_get_constraintdef(oid) like '%>= -100%'
  ) then
    raise exception '522: legacy margin_pct lower bound still present';
  end if;
end $$;
