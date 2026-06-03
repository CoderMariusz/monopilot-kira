-- Migration 083: Reference.D365_Constants table + Apex seed.
-- PRD: docs/prd/01-NPD-PRD.md §10.4.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create schema if not exists "Reference";
grant usage on schema "Reference" to app_user;

create table if not exists "Reference"."D365_Constants" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  constant_key text not null,
  constant_value text,
  description text not null,
  marker text not null default 'LEGACY-D365;APEX-CONFIG',
  last_updated timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint d365_constants_pk primary key (org_id, constant_key),
  constraint d365_constants_marker_check check (
    marker like '%LEGACY-D365%' and marker like '%APEX-CONFIG%'
  ),
  constraint d365_constants_schema_version_check check (schema_version >= 1)
);

create index if not exists d365_constants_org_idx
  on "Reference"."D365_Constants" (org_id);

alter table "Reference"."D365_Constants" enable row level security;
alter table "Reference"."D365_Constants" force row level security;

drop policy if exists "D365_Constants_org_context" on "Reference"."D365_Constants";
create policy "D365_Constants_org_context"
  on "Reference"."D365_Constants"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."D365_Constants" from public;
revoke all on "Reference"."D365_Constants" from app_user;
grant select, insert, update, delete on "Reference"."D365_Constants" to app_user;

create or replace function "Reference".seed_d365_constants_apex()
returns void
language sql
as $$
  insert into "Reference"."D365_Constants" (
    org_id,
    constant_key,
    constant_value,
    description,
    marker,
    schema_version
  )
  values
    ('00000000-0000-0000-0000-000000000002', 'PRODUCTIONSITEID', 'FNOR', 'Apex Production Site', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'APPROVERPERSONNELNUMBER', 'APX100048', 'Approver ID (Jane or default)', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'CONSUMPTIONWAREHOUSEID', 'ApexDG', 'Warehouse code', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'PRODUCTGROUPID_FG', 'FinGoods', 'Finished Goods group', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'PRODUCTGROUPID_PR', null, 'PR intermediates group; TBD until configured', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'COSTINGOPERATIONRESOURCEID_DEFAULT', 'APXProd01', 'Default resource (override per Line in Phase C)', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'FLUSHINGPRINCIPLE', 'Finish', 'Materials consumed at Finish', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'LINETYPE', 'Item', 'Default line type', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'CONSUMPTIONTYPE', 'Variable', 'Default consumption type', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'CONSUMPTIONCALCULATIONFORMULA', 'Formula0', 'Default consumption calculation formula', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'OPERATIONPRIORITY', 'Primary', 'Default operation priority', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'NEXTOPERATIONLINKTYPE_TERMINAL', 'None', 'Terminal operation link type for final operation', 'LEGACY-D365;APEX-CONFIG', 1)
  on conflict (org_id, constant_key) do nothing;
$$;

revoke all on function "Reference".seed_d365_constants_apex() from public;
revoke all on function "Reference".seed_d365_constants_apex() from app_user;

select "Reference".seed_d365_constants_apex();
