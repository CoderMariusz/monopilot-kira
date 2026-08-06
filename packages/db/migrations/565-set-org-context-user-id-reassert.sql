-- Migration 565 — re-assert app.set_org_context's mig-382 body, drop stale contexts, and
-- leave behind a check that goes RED if the body ever drifts back.
--
-- WHAT WAS MEASURED ON PRODUCTION (2026-08-06; the repair was done by hand with the owner's
-- approval, this migration is what makes it durable and non-silently-reversible)
--   public.schema_migrations says migration 382 was applied, and the column it adds,
--   app.active_org_contexts.user_id, EXISTS. Its function body did NOT: app.set_org_context
--   was still running migration 002's body. How the ledger and the body came apart is not
--   established (see NOT ESTABLISHED at the foot of this file) — which is precisely why the
--   fix ships as an executable check and not as a one-off repair.
--
--   Mig 002's body inserts (backend_pid, transaction_id, session_token, org_id, set_at) and
--   its ON CONFLICT (backend_pid) DO UPDATE refreshes those same four columns. user_id
--   appears in neither list. Therefore:
--     * every application transaction materialised an active context with user_id = NULL, and
--     * a row that already HAD a user_id kept it forever, because DO UPDATE refreshed
--       transaction_id / session_token / org_id / set_at around it and never touched it.
--   app.active_org_contexts held exactly one such row, set_at 2026-07-06, with user_id
--   31fe18af-43f7-4c05-a078-db23a9a5bd3e = admin@monopilot.test, the only platform
--   administrator on the instance. app.current_user_id() reads exactly that column, so every
--   later request that happened to land on that backend_pid ran as July's administrator, and
--   a query mirroring app.current_user_is_platform_admin() (the revoked_at is null branch)
--   returned t for that row.
--
--     PRZED | funkcja_pisze_user_id=f | wierszy=1 | z_user_id=1 | niesw_wiersz_daje_admina=t
--     PO    | funkcja_pisze_user_id=t | wierszy=0 | z_user_id=0
--
-- SCOPE — app.current_user_id() is deliberately NOT restated here even though it is the other
-- half of this trust chain. Migration 561 pinned it STABLE with ALTER FUNCTION, and a
-- create-or-replace that omits the qualifier silently reverts that (561 says so in its own
-- header). Do not add it to this file. app.set_org_context carries no volatility qualifier in
-- mig 382 either, but VOLATILE is the default and is the correct one for a function that
-- writes, so restating it changes nothing.
--
-- 382's two columns are re-asserted too, for the same reason the body is: this migration
-- trusts the database in front of it, not the ledger.

alter table app.session_org_contexts add column if not exists user_id uuid;
alter table app.active_org_contexts  add column if not exists user_id uuid;

-- ---------------------------------------------------------------------------
-- (1) The body. Copied verbatim from 382-current-user-id-context.sql — same signature, same
-- SECURITY DEFINER, same search_path. create-or-replace, so on a database that already
-- carries it this is a no-op that rewrites identical source.
-- ---------------------------------------------------------------------------
create or replace function app.set_org_context(session_token uuid, org uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid;
  v_found   boolean := false;
begin
  select trusted_context.user_id, true
    into v_user_id, v_found
    from app.session_org_contexts trusted_context
   where trusted_context.session_token = set_org_context.session_token
     and trusted_context.org_id = set_org_context.org;

  if not v_found then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  insert into app.active_org_contexts (backend_pid, transaction_id, session_token, org_id, user_id, set_at)
  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_org_context.session_token, set_org_context.org, v_user_id, pg_catalog.now())
  on conflict (backend_pid) do update
    set transaction_id = excluded.transaction_id,
        session_token = excluded.session_token,
        org_id = excluded.org_id,
        user_id = excluded.user_id,
        set_at = excluded.set_at;

  return set_org_context.org;
end;
$$;

-- create-or-replace preserves the existing ACL, but this is a SECURITY DEFINER function that
-- materialises an identity, so the grant is stated rather than assumed.
revoke all on function app.set_org_context(uuid, uuid) from public;
grant execute on function app.set_org_context(uuid, uuid) to app_user;

comment on function app.set_org_context(uuid, uuid) is
  'Migs 002/382, re-asserted by mig 565 after production was found running the 002 body: copies the OWNER-registered user_id out of app.session_org_contexts into app.active_org_contexts, on INSERT and on CONFLICT alike. Never trusts a caller-supplied user id (no user_id parameter, on purpose — app_user may execute this).';

-- ---------------------------------------------------------------------------
-- (2) Stale contexts.
--
-- ONLY rows older than one hour, and that cutoff is load-bearing — do not "simplify" it to a
-- bare delete-everything. app.active_org_contexts is keyed by backend_pid and is shared by
-- every backend in the pool: an unqualified delete would remove the context of a request
-- executing RIGHT NOW on another connection, whose next statement would then evaluate
-- app.current_org_id() as NULL and silently return nothing under RLS, mid-query.
--
-- One hour is the safety margin: with-org-context.ts opens the transaction, calls
-- set_org_context, does the work and commits, and every write path in this app runs inside
-- one HTTP request. No in-flight request owns a row whose set_at is an hour old; a row that
-- old belongs to a backend that has since moved on and left the row behind, which is exactly
-- the shape that made the July identity survivable in the first place.
-- ---------------------------------------------------------------------------
delete from app.active_org_contexts
 where set_at < pg_catalog.now() - interval '1 hour';

-- ============================== POST-CHECK (mig 565) ==============================
-- Proves BY EXECUTION that identity transfers. Reading the catalog would prove nothing here:
-- PREPARE does not validate function bodies in this repo, so a broken body passes a dry run
-- and fails at call time. Matching a fragment of pg_proc.prosrc would be worse than nothing —
-- a body that drifts into a shape the pattern does not describe simply stops matching and the
-- probe turns GREEN BY OMISSION. Nothing below reads prosrc.
--
-- It CONSTRUCTS the divergence instead of waiting to observe one — the lesson from mig 563,
-- whose observing probe produced one false red on production and one green-by-skip on a clone:
--   (1) INSERT branch    trusted row carries user A  -> app.current_user_id() must be A
--   (2) CONFLICT branch  same backend_pid, trusted row now carries user B
--                        -> app.current_user_id() must be B.
--                        THIS is the assertion nobody had for a month. Mig 002's DO UPDATE
--                        omits user_id, so a body that is half-fixed (writes user_id on
--                        insert, forgets it on conflict) passes (1) and fails only here.
--                        The check is non-vacuous by construction: the active row is asserted
--                        to already exist before the second call, so the second call cannot
--                        take the INSERT branch.
--   (3) counter-control  trusted row carries NULL -> app.current_user_id() must be NULL.
--                        B and NULL differ by construction, so a body that returns a constant,
--                        or a probe that reads something other than what set_org_context
--                        writes, fails (2) or (3). A green (2) alone is not a proof.
--
-- Everything it needs it creates. The only thing it reads out of the database is one
-- organization id, and only because app.session_org_contexts.org_id is a FOREIGN KEY;
-- session_org_contexts.user_id has no FK, so the probe users are pure synthetic uuids and no
-- public.users row (and none of the 50+ seed triggers on public.organizations) is touched.
-- Migration 030 seeds the apex organization unconditionally, so "no organization" means the
-- baseline itself is broken: that is a hard error, never a skip.
do $$
declare
  v_token  constant uuid := '00000565-0565-4565-8565-000000000565';
  v_user_a constant uuid := '00000565-0565-4565-8565-00000000000a';
  v_user_b constant uuid := '00000565-0565-4565-8565-00000000000b';
  v_org    uuid;
  v_got    uuid;
  v_left   bigint;
  v_stale  bigint;
begin
  -- The delete above must have landed. Asserted, not assumed.
  select pg_catalog.count(*) into v_stale
    from app.active_org_contexts
   where set_at < pg_catalog.now() - interval '1 hour';
  if v_stale > 0 then
    raise exception 'mig565: % active context row(s) older than an hour survived the delete', v_stale;
  end if;

  select o.id into v_org from public.organizations o order by o.id limit 1;
  if v_org is null then
    raise exception 'mig565: no organization to anchor the probe on — mig 030 seeds the apex org unconditionally, so this database is not the schema it claims to be';
  end if;

  begin
    -- Start the probe on the INSERT branch, provably: drop this backend's own active row, if
    -- any. Rolled back with the rest of the block, so a pre-existing context is restored.
    delete from app.active_org_contexts where backend_pid = pg_catalog.pg_backend_pid();

    -- The trusted row. app_user cannot write this table; only the owner pool does, which is
    -- the entire reason set_org_context reads the user id from here instead of taking it as
    -- an argument.
    insert into app.session_org_contexts (session_token, org_id, user_id)
    values (v_token, v_org, v_user_a)
    on conflict (session_token) do update
      set org_id = excluded.org_id, user_id = excluded.user_id;

    -- ── (1) INSERT branch ──
    perform app.set_org_context(v_token, v_org);
    v_got := app.current_user_id();
    if v_got is distinct from v_user_a then
      raise exception 'mig565: set_org_context did not carry the trusted user_id into a NEW active context — app.current_user_id() returned % , expected % (this is the mig-002 body: its INSERT column list has no user_id)',
        v_got, v_user_a;
    end if;

    -- The conflict branch is only exercised if a row for this backend_pid exists now.
    if not exists (
      select 1 from app.active_org_contexts where backend_pid = pg_catalog.pg_backend_pid()
    ) then
      raise exception 'mig565: set_org_context left no app.active_org_contexts row for backend_pid % — the conflict branch cannot be exercised, so the check below would be vacuous',
        pg_catalog.pg_backend_pid();
    end if;

    -- ── (2) CONFLICT branch — the drift that went unnoticed for a month ──
    update app.session_org_contexts set user_id = v_user_b where session_token = v_token;
    perform app.set_org_context(v_token, v_org);
    v_got := app.current_user_id();
    if v_got is distinct from v_user_b then
      raise exception 'mig565: set_org_context did not REFRESH user_id on conflict — after re-registering the backend under user % , app.current_user_id() still returns % . A stale row keeps its old identity while transaction_id/session_token/org_id/set_at move on: this is exactly how a July platform-admin row was inherited by later requests on production.',
        v_user_b, v_got;
    end if;

    -- ── (3) counter-control ──
    update app.session_org_contexts set user_id = null where session_token = v_token;
    perform app.set_org_context(v_token, v_org);
    v_got := app.current_user_id();
    if v_got is not null then
      raise exception 'mig565: counter-control failed — with a trusted user_id of NULL, app.current_user_id() returned % . Either the identity is not being read from what set_org_context writes, or the conflict branch is not clearing it.',
        v_got;
    end if;

    raise notice 'mig565: identity transfers — insert branch (%), conflict branch (%), NULL counter-control (NULL)',
      v_user_a, v_user_b;

    -- Roll the probe material back. A PL/pgSQL BEGIN...EXCEPTION block IS a savepoint.
    raise exception using errcode = 'P0001', message = 'mig565:probe-ok';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'mig565:probe-ok' then
      raise;
    end if;
  end;

  -- ...and that it DID roll back is evidence, not a declaration.
  select (select pg_catalog.count(*) from app.session_org_contexts c where c.session_token = v_token)
       + (select pg_catalog.count(*) from app.active_org_contexts  a where a.session_token = v_token)
       + (select pg_catalog.count(*) from app.active_org_contexts  a where a.user_id in (v_user_a, v_user_b))
    into v_left;
  if v_left <> 0 then
    raise exception 'mig565: post-check left % synthetic row(s) behind', v_left;
  end if;
  raise notice 'mig565: probe material rolled back — 0 synthetic rows remain';
end;
$$;

-- HOW THE COLUMN CAME FROM 382 AND THE BODY FROM 002 — reproduced, not guessed.
--
-- scripts/combined-migrations.sql is a frozen 2026-05-13 concatenation of migrations 001-036
-- whose own header reads "paste into Supabase SQL Editor / Idempotent: safe to run multiple
-- times". Its line 275 is mig 002's set_org_context, byte-identical to 002's (diff is empty).
-- It never writes public.schema_migrations, and it drops no columns.
--
-- Running that file against a clone migrated all the way THROUGH THIS MIGRATION reproduced
-- production's exact shape, measured:
--     kolumna active_org_contexts.user_id istnieje = true
--     cialo set_org_context wspomina user_id       = false
--     ledger: 382 zastosowana                      = true
--     ledger: liczba wpisow                        = 521   (521 before the paste; unchanged)
--     probe | insert_branch=f | conflict_branch=f
-- create-or-replace downgrades the body; the columns are additive so they stay; the ledger is
-- never touched, so nothing anywhere records that it happened. One paste, no trace.
--
-- The same paste ALSO silently reverts public.seed_reference_data_on_org_insert() (owned by
-- mig 078) and public.seed_system_roles_on_org_insert() (owned by mig 037) — the drift is not
-- specific to this function, only its consequences were. Deleting that file is the actual
-- root fix and is an owner decision, already open as audit item A2-10; this migration only
-- makes the damage to THIS function loud instead of silent.
