-- 281-line-machines-rls-fix.sql
-- F-D05 (2026-06-11 cross-module audit, Tor D) — close the RLS hole on
-- public.line_machines.
--
-- Migration 051 created `line_machines_app_user_access` as FOR ALL with
-- USING (true) / WITH CHECK (true). line_machines (mig 042:186-196) has NO
-- org_id column, so that open policy allowed cross-org READ **and WRITE** of
-- line<->machine links for any app_user session.
--
-- Fix: drop the open policy and recreate the access scoped through EXISTS
-- joins to BOTH parents — production_lines and machines each carry org_id
-- (mig 042:103-184) — compared against app.current_org_id() on BOTH the
-- USING and the WITH CHECK side. A link row is visible/writable only when
-- both ends belong to the caller's org.
--
-- Idempotent: safe to apply twice (drop-if-exists + recreate).

do $$
begin
  if to_regclass('public.line_machines') is not null then
    -- The open cmd=ALL qual=true policy from migration 051.
    drop policy if exists line_machines_app_user_access on public.line_machines;
    -- Re-runs of this migration.
    drop policy if exists line_machines_org_context_access on public.line_machines;

    create policy line_machines_org_context_access
      on public.line_machines
      for all
      to app_user
      using (
        exists (
          select 1
          from public.production_lines pl
          where pl.id = line_machines.line_id
            and pl.org_id = app.current_org_id()
        )
        and exists (
          select 1
          from public.machines m
          where m.id = line_machines.machine_id
            and m.org_id = app.current_org_id()
        )
      )
      with check (
        exists (
          select 1
          from public.production_lines pl
          where pl.id = line_machines.line_id
            and pl.org_id = app.current_org_id()
        )
        and exists (
          select 1
          from public.machines m
          where m.id = line_machines.machine_id
            and m.org_id = app.current_org_id()
        )
      );
  end if;
end
$$;
