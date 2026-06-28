-- Migration 382 — P1 of per-user-site RLS: the app.current_user_id() foundation.
--
-- RLS site-visibility policies (P3) need the authenticated user inside an app_user transaction. Today only
-- app.current_org_id() exists (mig 002): the OWNER pool registers app.session_org_contexts(session_token,
-- org_id) [app_user has NO write access to it], then the app_user txn calls app.set_org_context which copies
-- the trusted row into app.active_org_contexts keyed by backend_pid+txid, and current_org_id() reads it back.
--
-- We add user_id to the SAME trust chain. SECURITY-CRITICAL design choice: set_org_context does NOT take a
-- user_id PARAMETER (an app_user could forge it — set_org_context is SECURITY DEFINER and callable by app_user).
-- Instead the user_id is registered ONLY by the owner pool into session_org_contexts (the trusted, app_user-
-- unwritable table), and set_org_context READS it from that row when it materialises the active context. So
-- app.current_user_id() returns the owner-verified user and cannot be spoofed by the app role.
--
-- Backward compatible: both new columns are NULLABLE and set_org_context KEEPS its 2-arg signature (only its
-- body changes to copy user_id across). During the deploy window the old app code registers session rows with
-- user_id NULL → set_org_context copies NULL → current_user_id() returns NULL → the P2 helper treats NULL as
-- UNRESTRICTED (no false denials). No enforcement exists until P3 policies + user_sites assignments land.

alter table app.session_org_contexts add column if not exists user_id uuid;
alter table app.active_org_contexts  add column if not exists user_id uuid;

-- set_org_context: unchanged 2-arg signature; now copies the OWNER-registered user_id from the trusted
-- session row into the active context (never trusts a caller-supplied user id).
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

-- current_user_id(): mirrors current_org_id() exactly (same backend_pid+txid+trust join), returns user_id.
create or replace function app.current_user_id()
returns uuid
language sql
security definer
set search_path = pg_catalog
as $$
  select active_context.user_id
  from app.active_org_contexts active_context
  join app.session_org_contexts trusted_context
    on trusted_context.session_token = active_context.session_token
   and trusted_context.org_id = active_context.org_id
  where active_context.backend_pid = pg_catalog.pg_backend_pid()
    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
  limit 1
$$;

revoke all on function app.current_user_id() from public;
grant execute on function app.current_user_id() to app_user;
