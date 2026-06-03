-- Migration 084: 01-NPD T-049 - Alert thresholds + D365 import cache.
-- PRD: docs/prd/01-NPD-PRD.md sections 11.3, 10.8, 11.7.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- No default alert threshold seed here; T-050 owns seed values.

create schema if not exists "Reference";

create table if not exists "Reference"."AlertThresholds" (
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  threshold_key text        not null,
  value_int     integer,
  value_text    text,
  updated_at    timestamptz not null default pg_catalog.now(),
  primary key (org_id, threshold_key)
);

create index if not exists alert_thresholds_org_key_idx
  on "Reference"."AlertThresholds" (org_id, threshold_key);

alter table "Reference"."AlertThresholds" enable row level security;
alter table "Reference"."AlertThresholds" force row level security;

drop policy if exists alert_thresholds_org_context on "Reference"."AlertThresholds";
create policy alert_thresholds_org_context
  on "Reference"."AlertThresholds"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."AlertThresholds" from public;
grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."AlertThresholds" to app_user;

create table if not exists public.d365_import_cache (
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  code           text        not null,
  status         text        not null,
  comment        text,
  last_synced_at timestamptz not null default pg_catalog.now(),
  primary key (org_id, code),
  constraint d365_import_cache_status_check check (status in ('Found', 'NoCost', 'Missing'))
);

create index if not exists d365_import_cache_org_status_idx
  on public.d365_import_cache (org_id, status);

create index if not exists d365_import_cache_org_last_synced_idx
  on public.d365_import_cache (org_id, last_synced_at desc);

alter table public.d365_import_cache enable row level security;
alter table public.d365_import_cache force row level security;

drop policy if exists d365_import_cache_org_context on public.d365_import_cache;
create policy d365_import_cache_org_context
  on public.d365_import_cache
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.d365_import_cache from public;
grant select, insert, update, delete on public.d365_import_cache to app_user;

comment on table "Reference"."AlertThresholds"
  is 'T-049: Per-org NPD dashboard alert threshold configuration. Seed values are owned by T-050.';

comment on table public.d365_import_cache
  is 'T-049: Per-org D365 material-code validation cache for NPD dashboard/V04. Status is Found, NoCost, or Missing only.';
