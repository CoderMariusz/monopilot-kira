-- scripts/seed-e2e-user.sql — seed the shell-parity harness identity into a LOCAL database.
--
-- Why: the harness session (apps/web/e2e/_helpers/shell-parity.ts:134-152) authenticates
-- uid 11111111-1111-4111-8111-111111111111 in org 00000000-0000-0000-0000-000000000002,
-- but org_id does NOT come from the JWT — with-org-context.ts:243-250 reads it from
-- public.users and throws "no public.users row resolves org_id for verified user" for
-- every Server Action when the row is missing. Roles matter too: without user_roles the
-- nav filters down to nothing (layout.tsx:139-140) and actions return 403.
--
-- Strategy: clone an existing active Apex ADMIN (a production restore has one, and the
-- clone carries unknown/future columns for free); on a freshly migrated database there is
-- no account to clone — the migration chain creates none, production accounts come from
-- Supabase Auth + app code — so the row is built from scratch with the org's Admin role.
-- Idempotent — safe to re-run, in either order relative to packages/db/seeds/test-personas.ts.
--
-- Run as a SUPERUSER (the local `monopilot` role is created without BYPASSRLS and would read
-- zero rows through FORCE RLS — the seed refuses to run rather than seed nothing):
--   psql -d monopilot -v ON_ERROR_STOP=1 -f scripts/seed-e2e-user.sql

\set ON_ERROR_STOP on

begin;

do $seed$
declare
  harness_uid constant uuid := '11111111-1111-4111-8111-111111111111';
  harness_org constant uuid := '00000000-0000-0000-0000-000000000002';
  harness_email constant text := 'shell.parity@monopilot.local';
  src_id   uuid;
  admin_role_id uuid;
  col_list text;
  val_list text;
  unfilled text;
  role_count int;
begin
  -- public.users / public.user_roles are FORCE ROW LEVEL SECURITY with policies granted
  -- only to app_user (017-rbac.sql:70-71): any other role without BYPASSRLS reads zero
  -- rows here and would "succeed" while seeding nothing.
  if not (select bool_or(rolsuper or rolbypassrls) from pg_roles where rolname = current_user) then
    raise exception
      'seed-e2e-user: current_user % is neither superuser nor BYPASSRLS; connect as the owner role (DATABASE_URL_OWNER)',
      current_user;
  end if;

  -- The app's OWNER pool (DATABASE_URL_OWNER = role monopilot locally) resolves org_id with
  -- `select org_id from public.users where id = $1` (with-org-context.ts:243). public.users is
  -- FORCE ROW LEVEL SECURITY with policies granted only to app_user (017-rbac.sql:70-71), and
  -- production's owner role has BYPASSRLS (279-npd-storage.sql:28, 525-…:72-78) while the local
  -- one is created without it — so it reads ZERO rows and every Server Action throws
  -- "no public.users row resolves org_id". Mirror production. Local databases only.
  if exists (select 1 from pg_roles where rolname = 'monopilot' and not rolsuper and not rolbypassrls) then
    alter role monopilot bypassrls;
    raise notice 'seed-e2e-user: granted BYPASSRLS to role monopilot so the owner pool can read public.users';
  end if;

  if not exists (select 1 from public.organizations o where o.id = harness_org) then
    raise exception 'seed-e2e-user: org % does not exist — is this database migrated?', harness_org;
  end if;

  -- The admin role of the org: the clone source must hold it (a freshly seeded persona
  -- database also contains non-admin users, and cloning one would 403 every flow spec),
  -- and the from-scratch path assigns it. Slug family from 383-user-site-visibility-rls.sql:31.
  select r.id
    into admin_role_id
    from public.roles r
   where r.org_id = harness_org
     and (r.slug in ('admin', 'org.access.admin', 'org.platform.admin', 'owner', 'org_admin')
          or r.name = 'Admin')
   order by (r.slug = 'admin') desc, r.name
   limit 1;

  if admin_role_id is null then
    raise exception 'seed-e2e-user: org % has no admin role — is this database migrated?', harness_org;
  end if;

  select u.id
    into src_id
    from public.users u
   where u.org_id = harness_org
     and coalesce(u.is_active, true)
     and u.id <> harness_uid
     and exists (
       select 1
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = u.id
          and (r.slug in ('admin', 'org.access.admin', 'org.platform.admin', 'owner', 'org_admin')
               or r.name = 'Admin')
     )
   order by u.created_at nulls last, u.id
   limit 1;

  if src_id is not null then
    -- Restored-from-production database: clone, so unknown columns come along for free.
    -- Column list from the catalog: identity/generated columns cannot be inserted, and
    -- id/email/is_active/deleted_at are overridden rather than copied.
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
           string_agg(
             case c.column_name
               when 'id' then quote_literal(harness_uid)
               when 'email' then quote_literal(harness_email)
               when 'is_active' then 'true'
               when 'deleted_at' then 'null'
               else quote_ident(c.column_name)
             end, ', ' order by c.ordinal_position)
      into col_list, val_list
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'users'
       and c.is_generated = 'NEVER'
       and c.identity_generation is null;

    execute format(
      'insert into public.users (%s) select %s from public.users where id = $1 on conflict (id) do nothing',
      col_list, val_list
    ) using src_id;

    insert into public.user_roles (user_id, role_id, org_id)
    select harness_uid, ur.role_id, ur.org_id
      from public.user_roles ur
     where ur.user_id = src_id
    on conflict do nothing;
  else
    -- Freshly migrated database: the migration chain creates no login-capable account
    -- (production accounts come from Supabase Auth + app code), so build the row.
    -- Catalog check first: a future NOT NULL column this INSERT does not fill must fail
    -- with its name, not with a bare not-null violation.
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
      into unfilled
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'users'
       and c.is_nullable = 'NO'
       and c.column_default is null
       and c.is_generated = 'NEVER'
       and c.identity_generation is null
       and c.column_name not in ('id', 'org_id', 'email', 'name', 'display_name', 'role_id', 'is_active');

    if unfilled is not null then
      raise exception
        'seed-e2e-user: public.users requires column(s) % that this seed does not fill — add them to the INSERT below',
        unfilled;
    end if;

    insert into public.users (id, org_id, email, name, display_name, role_id, is_active)
    values (harness_uid, harness_org, harness_email, 'Shell Parity', 'Shell Parity', admin_role_id, true)
    on conflict (id) do nothing;

    insert into public.user_roles (user_id, role_id, org_id)
    values (harness_uid, admin_role_id, harness_org)
    on conflict do nothing;
  end if;

  -- Self-check: the two things the app actually reads.
  if not exists (select 1 from public.users where id = harness_uid and org_id = harness_org) then
    raise exception 'seed-e2e-user: public.users row for % was not created', harness_uid;
  end if;
  select count(*) into role_count from public.user_roles where user_id = harness_uid;
  if role_count = 0 then
    raise exception 'seed-e2e-user: % has no roles (source=%)', harness_uid, coalesce(src_id::text, 'created from scratch');
  end if;

  raise notice 'seed-e2e-user: % ready in org % with % role(s) (%)',
    harness_uid, harness_org, role_count,
    case when src_id is null then 'created from scratch with the org admin role' else 'cloned from ' || src_id end;
end
$seed$;

commit;
