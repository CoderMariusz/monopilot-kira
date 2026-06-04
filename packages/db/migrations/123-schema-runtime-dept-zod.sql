-- Migration 123: T-014 schema-runtime DeptColumns runtime metadata alignment.
-- Canonical tables are owned by earlier migrations:
--   009-schema-driven.sql creates "Reference"."DeptColumns"
--   077-reference-dept-columns.sql adds NPD metadata columns
--   079-reference-lookups.sql creates "Reference"."PackSizes"
-- This migration does not create canonical tables. It aligns DeptColumns with
-- the ADR-028 data_type contract and reasserts forced org-scoped RLS.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

alter table "Reference"."DeptColumns"
  add column if not exists data_type text;

update "Reference"."DeptColumns"
set data_type = case
  when dropdown_source is not null and btrim(dropdown_source) <> '' then 'dropdown'
  when field_type = 'string' then 'text'
  when field_type = 'enum' then 'dropdown'
  when field_type = 'integer' then 'number'
  when field_type = 'datetime' then 'date'
  else field_type
end
where data_type is null;

update "Reference"."DeptColumns"
set data_type = 'dropdown'
where dropdown_source is not null
  and btrim(dropdown_source) <> ''
  and data_type <> 'dropdown';

alter table "Reference"."DeptColumns" enable row level security;
alter table "Reference"."DeptColumns" force row level security;

drop policy if exists dept_columns_org_context on "Reference"."DeptColumns";
create policy dept_columns_org_context
  on "Reference"."DeptColumns"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table "Reference"."PackSizes" enable row level security;
alter table "Reference"."PackSizes" force row level security;

drop policy if exists "PackSizes_org_context" on "Reference"."PackSizes";
create policy "PackSizes_org_context"
  on "Reference"."PackSizes"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."DeptColumns" from public;
revoke all on "Reference"."PackSizes" from public;

grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."DeptColumns" to app_user;
grant select, insert, update, delete on "Reference"."PackSizes" to app_user;

comment on column "Reference"."DeptColumns".data_type
  is 'T-014 ADR-028 runtime primitive: text, number, date, or dropdown. Backfilled from legacy field_type for compatibility.';
