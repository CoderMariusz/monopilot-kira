-- Migration 111: 01-NPD T-028 - V03/V04 validator access contract.
-- Canonical tables are owned by earlier migrations:
--   079-reference-lookups.sql creates "Reference"."PackSizes"
--   084-alert-thresholds-and-d365-cache.sql creates public.d365_import_cache
-- This migration intentionally does not create either table. It reasserts the
-- app_user access and org-scoped forced RLS contract consumed by the validators.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

alter table "Reference"."PackSizes" enable row level security;
alter table "Reference"."PackSizes" force row level security;

drop policy if exists "PackSizes_org_context" on "Reference"."PackSizes";
create policy "PackSizes_org_context"
  on "Reference"."PackSizes"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.d365_import_cache enable row level security;
alter table public.d365_import_cache force row level security;

drop policy if exists d365_import_cache_org_context on public.d365_import_cache;
create policy d365_import_cache_org_context
  on public.d365_import_cache
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."PackSizes" from public;
revoke all on public.d365_import_cache from public;

grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."PackSizes" to app_user;
grant select, insert, update, delete on public.d365_import_cache to app_user;

comment on table "Reference"."PackSizes"
  is 'T-028 V03 source: per-org pack-size lookup for NPD validators.';

comment on table public.d365_import_cache
  is 'T-028 V04 source: per-org D365 material-code validation cache. Status values remain Found, NoCost, or Missing; Empty is a validator result when no cache row exists.';
