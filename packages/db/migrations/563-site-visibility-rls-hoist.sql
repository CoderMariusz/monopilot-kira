-- Migration 563 — site-visibility RLS stops running a 4-subquery function per row.
--
-- PROBLEM (measured on monopilot_t2, mig 561 already applied, role app_user)
--   Mig 383/551 gave 10 tables a RESTRICTIVE policy `using (app.user_can_see_site(site_id))`.
--   The function is STABLE, but it takes the ROW's site_id as an argument, so the planner
--   has nothing to hoist: it is executed once per candidate row. It is also SECURITY
--   DEFINER, which means Postgres cannot inline it — every call is a full executor run of
--   three correlated sub-selects over user_roles/roles/user_sites (~10 buffers per call).
--
--   Mig 561 removed the app.current_org_id() per-row cost and moved org_id into Index Cond.
--   That exposed this one as the remaining multiplier. Warehouse Movements screen,
--   150k rows (120k lp_state_history + 30k stock_moves), the exact queries from
--   stock-move-actions.ts, after 561:
--
--                                       with the per-row call   with `select true`
--     COUNT(*) over the UNION                  10 995 ms              90.9 ms
--     page 1 (limit 25)                        28 085 ms             560.0 ms
--
--   i.e. >99% of the remaining runtime of those screens is this predicate, and it grows
--   with total table size, not with the size of the answer. Adding (org_id, site_id, ts)
--   indexes was measured and does NOT help — the planner never picks them, because the
--   ORDER BY runs on top of a UNION and every row has to be visited anyway.
--
-- FIX
--   Split the predicate into the part that does not depend on the row and the part that
--   does, and wrap the row-independent part in a scalar sub-select so it becomes an
--   InitPlan evaluated ONCE per query instead of once per row:
--
--       site_id is not null                              -- fail closed before unrestricted branches
--       and (
--         (select app.user_site_scope_unrestricted())    -- once
--         or site_id = any ((select app.user_visible_sites()))  -- array built once, then a membership test
--       )
--
-- EQUIVALENCE (this is a security predicate; it must decide identically, not merely faster)
--   app.user_can_see_site(p) is `p is not null and (A or B or C or D(p))` where
--     A = current_user_id() is null, B = has an admin role, C = has no site assignments,
--     D(p) = exists(user_sites row for this user/org/site p).
--   user_site_scope_unrestricted() is exactly `A or B or C` — same three sub-selects,
--   same order, copied from mig 551's body.
--   user_visible_sites() is the set that D(p) tests membership of, so
--   `p = any(user_visible_sites())` ≡ D(p) for non-null p; NULL site_id is rejected
--   before the unrestricted branch, exactly as before. NULL rows in user_sites.site_id
--   are excluded from the array (they can never satisfy D(p) for a non-null p either).
--   The post-check below proves the equivalence by evaluating both forms for every
--   (user, site) pair that exists in this database, plus the NULL site.
--
--   app.user_can_see_site(uuid) is deliberately LEFT IN PLACE and unchanged: mig 551's own
--   post-check calls it, and it stays the readable single definition of the rule. It is
--   simply no longer the thing that runs 150 000 times.

create or replace function app.user_site_scope_unrestricted()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select
    -- (1) no registered user (pre-mig-382 deploy window / test stub) → unrestricted
    app.current_user_id() is null
    -- (2) admin role (canonical admin slug family) → unrestricted
    or exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = app.current_user_id()
         and ur.org_id  = app.current_org_id()
         and r.slug = any(array['org.access.admin','org.platform.admin','owner','admin','org_admin'])
    )
    -- (3) zero site assignments → unrestricted (opt-in; every user today)
    or not exists (
      select 1
        from public.user_sites us
       where us.user_id = app.current_user_id()
         and us.org_id  = app.current_org_id()
    )
$$;

create or replace function app.user_visible_sites()
returns uuid[]
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select coalesce(pg_catalog.array_agg(us.site_id), '{}'::uuid[])
    from public.user_sites us
   where us.user_id = app.current_user_id()
     and us.org_id  = app.current_org_id()
     and us.site_id is not null
$$;

revoke all on function app.user_site_scope_unrestricted() from public;
revoke all on function app.user_visible_sites() from public;
grant execute on function app.user_site_scope_unrestricted() to app_user;
grant execute on function app.user_visible_sites() to app_user;

comment on function app.user_site_scope_unrestricted() is
  'Mig 563 — the row-independent half of app.user_can_see_site: no user / admin role / no site assignments. Zero-arg on purpose, so `(select app.user_site_scope_unrestricted())` in an RLS policy becomes an InitPlan run once per query.';
comment on function app.user_visible_sites() is
  'Mig 563 — the set app.user_can_see_site''s last clause tests membership of. Zero-arg on purpose; see user_site_scope_unrestricted.';

-- ---------------------------------------------------------------------------
-- Rewrite every site-visibility policy. Driven off the catalog rather than a
-- hard-coded table list, so a policy added by a later migration in the same
-- shape is picked up too, and none of today's ten can be missed.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_pred constant text :=
    -- The outer parens are load-bearing: this string is interpolated straight into
    -- `using %s with check %s`, and USING/WITH CHECK require a parenthesised
    -- expression. The pre-fix predicate happened to start with `(` and end with `)`,
    -- so it wrapped itself; `site_id is not null and (...)` does not.
    '(site_id is not null'
    || ' and ((select app.user_site_scope_unrestricted())'
    -- the ::uuid[] is required, not cosmetic: without it the grammar reads
    -- `any (select …)` as the SUBQUERY form of ANY and fails with `uuid = uuid[]`.
    || ' or site_id = any ((select app.user_visible_sites())::uuid[])))';
  v_count integer := 0;
begin
  for r in
    select pol.polname                       as policy_name,
           pol.polrelid::regclass::text       as table_name,
           pol.polpermissive                  as is_permissive,
           pg_catalog.array_to_string(pol.polroles::regrole[], ', ') as roles
      from pg_catalog.pg_policy pol
     where pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) = 'app.user_can_see_site(site_id)'
       and pol.polcmd = '*'
  loop
    if r.is_permissive then
      raise exception 'mig563: policy %.% is PERMISSIVE, expected RESTRICTIVE — refusing to rewrite it blind',
        r.table_name, r.policy_name;
    end if;

    execute pg_catalog.format('drop policy %I on %s', r.policy_name, r.table_name);
    execute pg_catalog.format(
      'create policy %I on %s as restrictive for all to %s using %s with check %s',
      r.policy_name, r.table_name, r.roles, v_pred, v_pred);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'mig563: found no site-visibility policies to rewrite — migs 383/551 expected 10';
  end if;
  raise notice 'mig563: rewrote % site-visibility policies', v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post-check. Three things: (a) no policy still carries the per-row call;
-- (b) the new predicate DECIDES THE SAME as app.user_can_see_site for every
-- (user, site) pair in this database plus the NULL site; (c) the installed policy
-- expression really hides an unassigned site and really shows an assigned one, on a
-- restricted user CONSTRUCTED here for the purpose and rolled back afterwards.
-- Runs the functions for real — PREPARE does not validate SQL function bodies in
-- this repo.
-- ---------------------------------------------------------------------------
do $$
declare
  v_left   integer;
  v_user   record;
  v_site   uuid;
  v_token  uuid := '00000563-0000-4000-8000-000000000563';
  v_old    boolean;
  v_new    boolean;
  v_pairs  integer := 0;
  -- Fixed ids for the constructed restricted case below. Constants, not looked up,
  -- so the clean-up assertion after the block can name exactly what to look for.
  v_probe_user    constant uuid := '00000563-0563-4563-8563-000000000001';
  v_probe_visible constant uuid := '00000563-0563-4563-8563-000000000002';
  v_probe_hidden  constant uuid := '00000563-0563-4563-8563-000000000003';
  v_probe_org     uuid;
  v_probe  record;
  v_expr   text;
  v_odd    integer;
begin
  select pg_catalog.count(*) into v_left
    from pg_catalog.pg_policy pol
   where pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) like '%user_can_see_site(site_id)%';
  if v_left > 0 then
    raise exception 'mig563: % policies still call app.user_can_see_site per row', v_left;
  end if;

  begin
    for v_user in
      select u.id as user_id, u.org_id from public.users u order by u.id
    loop
      insert into app.session_org_contexts (session_token, org_id, user_id)
      values (v_token, v_user.org_id, v_user.user_id)
      on conflict (session_token) do update
        set org_id = excluded.org_id, user_id = excluded.user_id;
      perform app.set_org_context(v_token, v_user.org_id);

      for v_site in
        select s.id from public.sites s where s.org_id = v_user.org_id
        union all select null::uuid
      loop
        v_old := app.user_can_see_site(v_site);
        -- same three clauses as the policy; the `(select …)` wrapper the policy uses is
        -- a planner hint only (InitPlan), it does not change what is computed.
        v_new := v_site is not null
                 and (
                   app.user_site_scope_unrestricted()
                   or v_site = any (app.user_visible_sites())
                 );
        v_pairs := v_pairs + 1;
        if v_old is distinct from coalesce(v_new, false) then
          raise exception 'mig563: predicate differs for user % site %: old=% new=%',
            v_user.user_id, v_site, v_old, v_new;
        end if;
      end loop;
    end loop;

    raise notice 'mig563: predicate equivalence verified on % (user, site) pairs', v_pairs;

    -- ── the restricted branch: CONSTRUCT the divergence, never wait for one ──
    -- Every user in a fresh database is UNRESTRICTED (no user_sites rows), so the loop
    -- above only ever exercises the `true` branch. The branch that actually HIDES rows —
    -- the one a bug would open — has to be built here.
    --
    -- The first version of this probe took whatever user the database happened to hold,
    -- stripped its roles, gave it one site and then asserted that some OTHER site had gone
    -- dark. On a database where that user already had the other sites assigned nothing
    -- went dark and the migration aborted with "assertion is vacuous" — a false alarm
    -- shaped like a gate, stopping a correct migration on correct data (measured on
    -- production and on monopilot_ver). Nothing below reads what the database happens to
    -- contain:
    --   * a NEW user, so public.user_roles holds nothing for it → the admin branch cannot fire;
    --   * exactly ONE user_sites row, written here → the zero-assignment branch cannot fire
    --     and the visible set is known to be exactly {v_probe_visible};
    --   * TWO new sites in that same org, one assigned and one not.
    -- The org is an existing row: users.org_id and app.session_org_contexts.org_id are
    -- FOREIGN KEYs. It contributes an identifier only — every clause of the predicate is
    -- filtered by the probe user, who is new, so no ambient role or assignment reaches it.
    select o.id into v_probe_org
      from public.organizations o
     where exists (select 1 from public.roles r where r.org_id = o.id)
     order by o.id limit 1;
    if v_probe_org is null then
      raise exception 'mig563: no organization with a role to anchor the restricted-branch probe on';
    end if;

    insert into public.sites (id, org_id, site_code, name) values
      (v_probe_visible, v_probe_org, 'MIG563-PROBE-VISIBLE', 'mig563 probe — assigned site'),
      (v_probe_hidden,  v_probe_org, 'MIG563-PROBE-HIDDEN',  'mig563 probe — unassigned site');
    -- role_id is a NOT NULL FK on public.users; it is NOT what the predicate reads (that is
    -- public.user_roles, which holds nothing for this user), so any role of the org will do.
    insert into public.users (id, org_id, email, name, role_id)
    values (v_probe_user, v_probe_org, 'mig563-probe@invalid.example', 'mig563 restricted probe',
            (select r.id from public.roles r where r.org_id = v_probe_org order by r.id limit 1));
    insert into public.user_sites (org_id, user_id, site_id)
    values (v_probe_org, v_probe_user, v_probe_visible);

    -- ── the identity, set EXPLICITLY, never inherited from the session ──
    -- A migration always runs WITHOUT an application session: nothing has called
    -- app.set_org_context, so app.current_user_id() is NULL, and NULL short-circuits the
    -- predicate to "unrestricted" (mig 551 clause 1) — no site can ever be hidden. That is
    -- the normal state of a migration, not an exception, so the probe establishes the
    -- identity itself. app.current_user_id() (migs 002/382) reads exactly one thing: the
    -- app.active_org_contexts row keyed by (backend_pid, transaction_id), joined back to
    -- the trusted app.session_org_contexts row on (session_token, org_id). No GUC, no JWT
    -- claim, no session variable feeds it — so both rows are written here, in that order.
    insert into app.session_org_contexts (session_token, org_id, user_id)
    values (v_token, v_probe_org, v_probe_user)
    on conflict (session_token) do update
      set org_id = excluded.org_id, user_id = excluded.user_id;

    -- The application's own route first — REPORTED, not trusted. On a database where
    -- app.set_org_context does not carry user_id across (mig 002's body, which mig 382
    -- replaced precisely to add that carry) this notice is how you find out, and it means
    -- app.current_user_id() is NULL for every application session too, which leaves all 13
    -- restrictive site policies inert. The probe below does not depend on it either way.
    perform app.set_org_context(v_token, v_probe_org);
    raise notice 'mig563: app.set_org_context carried the probe user into the active context: %',
      (app.current_user_id() is not distinct from v_probe_user);

    -- ...then the row app.current_user_id() actually reads, written directly.
    insert into app.active_org_contexts (backend_pid, transaction_id, session_token, org_id, user_id)
    values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), v_token, v_probe_org, v_probe_user)
    on conflict (backend_pid) do update
      set transaction_id = excluded.transaction_id,
          session_token  = excluded.session_token,
          org_id         = excluded.org_id,
          user_id        = excluded.user_id;

    if app.current_user_id() is distinct from v_probe_user then
      raise exception 'mig563: cannot establish a probe identity — app.current_user_id() is % (backend_pid=%, txid=%, stored user_id=%, stored org_id=%). The READ path of app.current_user_id() is broken, so no site-visibility policy can restrict anything for anyone.',
        app.current_user_id(), pg_catalog.pg_backend_pid(), pg_catalog.txid_current(),
        (select a.user_id from app.active_org_contexts a where a.backend_pid = pg_catalog.pg_backend_pid()),
        (select a.org_id  from app.active_org_contexts a where a.backend_pid = pg_catalog.pg_backend_pid());
    end if;

    -- The probe is only worth running if the user really came out RESTRICTED. This checks
    -- the CONSTRUCTION, not the ambient data — it cannot turn a healthy database red.
    if app.user_site_scope_unrestricted() then
      raise exception 'mig563: probe user % is still unrestricted (roles=%, assignments=%) — construction failed',
        app.current_user_id(),
        (select pg_catalog.count(*) from public.user_roles ur where ur.user_id = v_probe_user),
        (select pg_catalog.count(*) from public.user_sites us where us.user_id = v_probe_user);
    end if;

    -- Evaluate the predicate that was ACTUALLY INSTALLED, read back from the catalog,
    -- rather than a hand-copy of it: a hand-copy stays green when the rewritten policy
    -- breaks, which would make this whole block decorative.
    -- The policies are found by IDENTITY (the RESTRICTIVE FOR ALL <table>_site_visibility
    -- family migs 383/551 created) and never by a fragment of the predicate itself —
    -- matching on the predicate means a broken predicate simply stops being found, and a
    -- probe that cannot find its subject is not a probe.
    select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid)
      into v_expr
      from pg_catalog.pg_policy pol
     where pol.polname like '%\_site\_visibility'
       and pol.polpermissive = false
       and pol.polcmd = '*'
     order by pol.polname
     limit 1;
    if v_expr is null then
      raise exception 'mig563: no <table>_site_visibility policy left to probe';
    end if;
    -- ...and one policy is only evidence for all of them if they are textually identical.
    select pg_catalog.count(*) into v_odd
      from pg_catalog.pg_policy pol
     where pol.polname like '%\_site\_visibility'
       and pol.polpermissive = false
       and pol.polcmd = '*'
       and (pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) is distinct from v_expr
            or pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) is distinct from v_expr);
    if v_odd > 0 then
      raise exception 'mig563: % site-visibility policies carry a USING/WITH CHECK that differs from the probed predicate', v_odd;
    end if;

    -- BOTH directions. The assigned site MUST stay visible: a predicate that hides
    -- everything also "hides the unassigned site", so the counter-control is half the
    -- proof, not decoration.
    for v_probe in
      select * from (values (v_probe_visible, true,  'assigned'),
                            (v_probe_hidden,  false, 'unassigned'),
                            (null::uuid,      false, 'NULL')) as t(site, expected, label)
    loop
      v_old := app.user_can_see_site(v_probe.site);
      execute pg_catalog.format('select %s from (select $1::uuid as site_id) probe', v_expr)
        into v_new using v_probe.site;
      if v_old is distinct from coalesce(v_new, false) then
        raise exception 'mig563: restricted-branch mismatch on the % site %: old=% new=%',
          v_probe.label, v_probe.site, v_old, v_new;
      end if;
      if coalesce(v_new, false) <> v_probe.expected then
        raise exception 'mig563: the % site % is %, expected % (visible set = %)',
          v_probe.label, v_probe.site,
          case when coalesce(v_new, false) then 'VISIBLE' else 'HIDDEN' end,
          case when v_probe.expected then 'VISIBLE' else 'HIDDEN' end,
          app.user_visible_sites();
      end if;
    end loop;
    raise notice 'mig563: restricted branch verified — assigned site visible, unassigned site hidden, NULL hidden (visible set = %)',
      app.user_visible_sites();

    raise exception using errcode = 'P0001', message = 'mig563:probe-ok';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'mig563:probe-ok' then
      raise;
    end if;
  end;

  -- The block above is an implicit SAVEPOINT (that is what PL/pgSQL BEGIN…EXCEPTION is),
  -- and catching 'mig563:probe-ok' rolls it back. That it DID roll back is asserted with a
  -- query — "the transaction will undo it" is a declaration, this is the evidence.
  select (select pg_catalog.count(*) from public.users u where u.id = v_probe_user)
       + (select pg_catalog.count(*) from public.sites s where s.id in (v_probe_visible, v_probe_hidden))
       + (select pg_catalog.count(*) from public.user_sites us where us.user_id = v_probe_user)
       + (select pg_catalog.count(*) from app.session_org_contexts c where c.session_token = v_token)
       + (select pg_catalog.count(*) from app.active_org_contexts a where a.session_token = v_token)
    into v_left;
  if v_left <> 0 then
    raise exception 'mig563: post-check left % synthetic row(s) behind', v_left;
  end if;
  raise notice 'mig563: post-check material rolled back — 0 synthetic rows remain';
end;
$$;
