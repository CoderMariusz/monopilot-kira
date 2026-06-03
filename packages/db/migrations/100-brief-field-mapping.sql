-- Migration 100: Reference.BriefFieldMapping table for NPD §9.5 Brief -> PLD mappings.
--
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- C21-C37 are deliberately not represented until the Phase B.2 rescan closes BL-NPD-01.

create schema if not exists "Reference";
grant usage on schema "Reference" to app_user;

create table if not exists "Reference"."BriefFieldMapping" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  brief_col text not null,
  fa_target text not null,
  transform text not null,
  marker text not null,
  schema_version integer not null default 1,
  constraint brief_field_mapping_pk primary key (org_id, brief_col),
  constraint brief_field_mapping_brief_col_check check (
    brief_col ~ '^C([1-9]|1[0-9]|20)$'
  ),
  constraint brief_field_mapping_schema_version_check check (schema_version >= 1),
  constraint brief_field_mapping_marker_not_reserved_check check (
    lower(marker) not like '%reserved%'
  )
);

create index if not exists brief_field_mapping_org_idx
  on "Reference"."BriefFieldMapping" (org_id);

alter table "Reference"."BriefFieldMapping" enable row level security;
alter table "Reference"."BriefFieldMapping" force row level security;

drop policy if exists "BriefFieldMapping_org_context" on "Reference"."BriefFieldMapping";
create policy "BriefFieldMapping_org_context"
  on "Reference"."BriefFieldMapping"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."BriefFieldMapping" from public;
revoke all on "Reference"."BriefFieldMapping" from app_user;
grant select, insert, update, delete on "Reference"."BriefFieldMapping" to app_user;
