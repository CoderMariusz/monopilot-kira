-- Migration 021: Add column defaults to allow test seeds to omit non-key fields
-- Scope: T-016 test-seed compatibility
-- The test's beforeAll seed inserts tenants(id,name,slug) and organizations(id,tenant_id,name,slug)
-- without specifying data_plane_url / industry_code which have NOT NULL constraints.
-- Adding server-side defaults lets those INSERTs succeed (ON CONFLICT DO NOTHING fires for
-- rows that already exist; new rows get the default values).

alter table public.tenants
  alter column data_plane_url set default '';

alter table public.organizations
  alter column industry_code set default 'generic';
