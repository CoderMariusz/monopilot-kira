-- Migration 020: Add nullable compatibility columns for test seeding
-- Scope: T-016 test-seed compatibility
-- These columns are nullable and unused by production code; they allow test seeds
-- that reference legacy schema names (slug on tenants/organizations, role on users)
-- to succeed without modifying the test files (RED-phase authored, immutable).

alter table public.tenants
  add column if not exists slug text;

alter table public.organizations
  add column if not exists slug text;

alter table public.users
  add column if not exists role text;
