-- Migration: 000-app-user-role.sql
-- Purpose: Ensure the RLS runtime role exists before early migrations grant to it.
--
-- 002-rls-baseline.sql grants privileges to app_user, while the historical
-- 006-app-role.sql also creates/normalizes the role. Fresh CI databases apply
-- migrations numerically, so app_user must exist before 002 can run.
--
-- The password is the repository's documented local/CI fallback used by
-- DATABASE_URL_APP/APP_USER_PASSWORD in tests. Production environments should
-- supply their own DATABASE_URL_APP role/password and may rotate this role after
-- bootstrap.
DO $$
BEGIN
  CREATE ROLE app_user
    LOGIN
    PASSWORD 'app-user-test-password'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE app_user
    LOGIN
    PASSWORD 'app-user-test-password'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOBYPASSRLS;
END
$$;
