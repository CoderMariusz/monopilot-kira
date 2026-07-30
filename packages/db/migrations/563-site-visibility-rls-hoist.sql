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
--       (select app.user_site_scope_unrestricted())      -- once
--       or site_id is null                               -- free
--       or site_id = any ((select app.user_visible_sites()))  -- array built once, then a membership test
--
-- EQUIVALENCE (this is a security predicate; it must decide identically, not merely faster)
--   app.user_can_see_site(p) is `A or B or C or p is null or D(p)` where
--     A = current_user_id() is null, B = has an admin role, C = has no site assignments,
--     D(p) = exists(user_sites row for this user/org/site p).
--   user_site_scope_unrestricted() is exactly `A or B or C` — same three sub-selects,
--   same order, copied from mig 551's body.
--   user_visible_sites() is the set that D(p) tests membership of, so
--   `p = any(user_visible_sites())` ≡ D(p) for non-null p; NULL site_id is decided one
--   clause earlier by `site_id is null`, exactly as before. NULL rows in user_sites.site_id
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
    '((select app.user_site_scope_unrestricted())'
    || ' or site_id is null'
    -- the ::uuid[] is required, not cosmetic: without it the grammar reads
    -- `any (select …)` as the SUBQUERY form of ANY and fails with `uuid = uuid[]`.
    || ' or site_id = any ((select app.user_visible_sites())::uuid[]))';
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
-- Post-check. Two things: (a) no policy still carries the per-row call, and
-- (b) the new predicate DECIDES THE SAME as app.user_can_see_site for every
-- (user, site) pair in this database plus the NULL site. Runs the functions for
-- real — PREPARE does not validate SQL function bodies in this repo.
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
        v_new := app.user_site_scope_unrestricted()
                 or v_site is null
                 or v_site = any (app.user_visible_sites());
        v_pairs := v_pairs + 1;
        if v_old is distinct from coalesce(v_new, false) then
          raise exception 'mig563: predicate differs for user % site %: old=% new=%',
            v_user.user_id, v_site, v_old, v_new;
        end if;
      end loop;
    end loop;

    raise notice 'mig563: predicate equivalence verified on % (user, site) pairs', v_pairs;

    -- Every user in a fresh database is UNRESTRICTED (no user_sites rows), so the loop
    -- above only ever exercises the `true` branch. Build the restricted case on purpose
    -- and check the branch that actually hides rows — that is the one a bug would open.
    select u.id as user_id, u.org_id into v_user
      from public.users u
     where exists (select 1 from public.sites s1 where s1.org_id = u.org_id)
       and (select pg_catalog.count(distinct s2.id) from public.sites s2 where s2.org_id = u.org_id) >= 2
     order by u.id limit 1;
    if v_user is null then
      raise notice 'mig563: no org with 2+ sites — skipped the restricted-branch probe';
    else
      delete from public.user_roles where user_id = v_user.user_id;  -- drop the admin bypass
      insert into public.user_sites (org_id, user_id, site_id)
      select v_user.org_id, v_user.user_id, s.id
        from public.sites s where s.org_id = v_user.org_id order by s.id limit 1;

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
        v_new := app.user_site_scope_unrestricted()
                 or v_site is null
                 or v_site = any (app.user_visible_sites());
        if v_old is distinct from coalesce(v_new, false) then
          raise exception 'mig563: restricted-branch mismatch for site %: old=% new=%', v_site, v_old, v_new;
        end if;
      end loop;

      -- and the branch is genuinely restrictive, i.e. the probe proved something
      if app.user_can_see_site((select s.id from public.sites s
                                 where s.org_id = v_user.org_id order by s.id desc limit 1)) then
        raise exception 'mig563: restricted probe never produced a hidden site — assertion is vacuous';
      end if;
      raise notice 'mig563: restricted branch verified (visible sites = %)', app.user_visible_sites();
    end if;

    raise exception using errcode = 'P0001', message = 'mig563:probe-ok';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'mig563:probe-ok' then
      raise;
    end if;
  end;
end;
$$;
