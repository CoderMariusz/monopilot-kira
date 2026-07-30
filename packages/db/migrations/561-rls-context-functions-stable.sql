-- Migration 561 — the three RLS context functions get their missing volatility
-- qualifier. One keyword; it is the single largest read-path win in the schema.
--
-- PROBLEM
--   app.current_org_id() (mig 002), app.current_user_id() (mig 382) and
--   app.current_user_is_platform_admin() (mig 410) were all declared without a
--   volatility qualifier, so Postgres defaulted them to VOLATILE. A VOLATILE
--   function in a WHERE clause:
--     * must be re-evaluated FOR EVERY ROW, and
--     * can never be pushed into an Index Cond.
--   353 RLS policies expand to `org_id = app.current_org_id()`, so every single
--   read in the app paid a SECURITY DEFINER two-table join per row AND lost its
--   index. Measured on monopilot_t2 (120k rows, index on (org_id, occurred_at)):
--     full scan under RLS      369.654 ms / 241459 buffers  ->    3.352 ms / 1566 buffers
--     range query on the index  13.370 ms /   7835 buffers  ->    0.098 ms /   52 buffers
--   and `org_id` moved from `Filter:` into `Index Cond:` exactly as expected.
--
-- WHY STABLE IS TRUE FOR THESE THREE (and not merely convenient)
--   STABLE promises two things. Both hold, by inspection of the bodies:
--   (1) "does not modify the database" — all three are plain SELECTs over
--       app.active_org_contexts / app.session_org_contexts / app.platform_admins.
--       The only writer of the context tables is app.set_org_context (VOLATILE,
--       unchanged here); no trigger, no other routine in the database calls it
--       (pg_proc.prosrc scan returns set_org_context itself and nothing else).
--   (2) "same result within one statement" — the inputs are pg_backend_pid()
--       and txid_current_if_assigned(), both already STABLE in pg_catalog, plus
--       table contents that only set_org_context can change. Every call site in
--       the repo issues `select app.set_org_context($1,$2)` as its OWN statement
--       (with-org-context.ts: begin -> set_org_context -> work -> commit), so no
--       statement both switches and reads the context.
--   STABLE is per-STATEMENT, not per-transaction: switching org mid-transaction
--   keeps working, because the next statement re-evaluates the function against
--   the current snapshot, which already contains the previous command's write.
--
--   Side effect worth naming: app.user_can_see_site / app.user_default_site /
--   app.current_site_id were ALREADY declared STABLE while calling these two
--   VOLATILE functions. Postgres does not verify callee volatility, so those 10
--   site-visibility policies have been making a promise their internals did not
--   keep. After this migration the promise is actually true.
--
-- NOT CHANGED, on purpose:
--   app.get_my_tenant_idp_config(uuid) is also read-only and would qualify, but
--   it appears in no RLS policy and in no per-row path, so it stays VOLATILE and
--   keeps this migration's blast radius at exactly the three context functions.
--
-- ALTER, not CREATE OR REPLACE: it pins the qualifier without restating bodies
-- that migs 002/382/410 own. NOTE for future migrations — a later
-- `create or replace function app.current_org_id() ...` that omits STABLE silently
-- reverts all of the above; keep the qualifier when you touch these bodies.

alter function app.current_org_id() stable;
alter function app.current_user_id() stable;
alter function app.current_user_is_platform_admin() stable;

comment on function app.current_org_id() is
  'Mig 561 — STABLE: read-only over app.active_org_contexts/session_org_contexts; only app.set_org_context writes them, and never inside a statement that also reads the context. STABLE lets 353 RLS policies use org_id as an Index Cond instead of a per-row filter.';
comment on function app.current_user_id() is
  'Mig 561 — STABLE, same reasoning as app.current_org_id(): reads the same two context tables.';
comment on function app.current_user_is_platform_admin() is
  'Mig 561 — STABLE: exists() over app.platform_admins keyed by app.current_user_id().';

-- ---------------------------------------------------------------------------
-- Post-check. PREPARE does not validate function bodies in this repo, so this
-- block both reads the catalog AND executes the functions for real.
-- ---------------------------------------------------------------------------
do $$
declare
  v_wrong text;
  v_org   uuid;
  v_token uuid := '00000561-0000-4000-8000-000000000561';
  v_got   uuid;
begin
  -- (1) the qualifier actually landed
  select pg_catalog.string_agg(p.proname || '=' || p.provolatile::text, ', ' order by p.proname)
    into v_wrong
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('current_org_id', 'current_user_id', 'current_user_is_platform_admin')
     and p.provolatile <> 's';
  if v_wrong is not null then
    raise exception 'mig561: RLS context functions are not STABLE: % (expected provolatile=s)', v_wrong;
  end if;

  -- (2) they still RUN, and are still fail-closed without a context
  if not exists (
    select 1 from app.active_org_contexts
     where backend_pid = pg_catalog.pg_backend_pid()
  ) then
    if app.current_org_id() is not null or app.current_user_id() is not null then
      raise exception 'mig561: context functions returned a value with no active context (fail-open)';
    end if;
    if app.current_user_is_platform_admin() then
      raise exception 'mig561: current_user_is_platform_admin() is true with no active context';
    end if;
  end if;

  -- (3) live round-trip: set a context, read it back. Runs inside a
  --     subtransaction that always rolls back, so the probe rows never persist
  --     and any pre-existing context of this backend is restored.
  select o.id into v_org from public.organizations o order by o.id limit 1;
  if v_org is null then
    raise notice 'mig561: no organizations yet — skipped the live round-trip probe';
    return;
  end if;

  begin
    insert into app.session_org_contexts (session_token, org_id) values (v_token, v_org);
    perform app.set_org_context(v_token, v_org);
    v_got := app.current_org_id();
    if v_got is distinct from v_org then
      raise exception 'mig561: app.current_org_id() returned % after set_org_context(%)', v_got, v_org;
    end if;
    -- force the rollback of everything this probe wrote
    raise exception using errcode = 'P0001', message = 'mig561:probe-ok';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'mig561:probe-ok' then
      raise;
    end if;
  end;
end;
$$;
