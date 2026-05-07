-- Migration: 006-app-role.sql
-- Purpose: Create monopilot_app (NOLOGIN template) and monopilot_app_local (LOGIN per-env)
--          roles; ensure app_user exists as test login role; apply FORCE ROW LEVEL SECURITY.
-- Idempotent: all role creation uses DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL $$

-- Step 1: Create monopilot_app NOLOGIN template role (no SUPERUSER, no BYPASSRLS)
DO $$
BEGIN
  CREATE ROLE monopilot_app
    NOLOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Step 2: Create per-env login role monopilot_app_local inheriting from monopilot_app
DO $$
BEGIN
  CREATE ROLE monopilot_app_local
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOBYPASSRLS
    IN ROLE monopilot_app;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Step 3: Ensure app_user exists as a test login role (inherits from monopilot_app)
DO $$
BEGIN
  CREATE ROLE app_user
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Ensure app_user is a member of monopilot_app (idempotent via DO block)
DO $$
BEGIN
  GRANT monopilot_app TO app_user;
EXCEPTION WHEN others THEN
  NULL;
END
$$;

-- Step 4: Grant schema usage
GRANT USAGE ON SCHEMA public TO monopilot_app;

-- Step 5: Grant DML on all three tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO monopilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO monopilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO monopilot_app;

-- Step 6: Enable and FORCE ROW LEVEL SECURITY on all three tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Step 7: Revoke superuser-style privileges from monopilot_app and app_user
-- (NOSUPERUSER / NOBYPASSRLS are already set at CREATE ROLE time above)
ALTER ROLE monopilot_app NOSUPERUSER NOBYPASSRLS;
ALTER ROLE monopilot_app_local NOSUPERUSER NOBYPASSRLS;
ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS;
