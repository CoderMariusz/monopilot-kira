-- Migration 079: 01-NPD reference lookup tables for cascade Chain 1.
-- PRD: docs/prd/01-NPD-PRD.md §4.1, §6.1, §7.2, §11.3.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- NOTE: AlertThresholds is OWNED by T-049 (migration 084), NOT here. Removed from T-005
-- to resolve a sibling-migration collision (both created "Reference"."AlertThresholds"
-- with different schemas). Default AlertThresholds seed is T-050.

create schema if not exists "Reference";

create table if not exists "Reference"."PackSizes" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, value)
);

create table if not exists "Reference"."Templates" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_name text not null,
  operation_1_name text,
  operation_2_name text,
  operation_3_name text,
  operation_4_name text,
  created_at timestamptz not null default now(),
  primary key (org_id, template_name)
);

create table if not exists "Reference"."Lines_By_PackSize" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  line text not null,
  supported_pack_sizes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  primary key (org_id, line)
);

create table if not exists "Reference"."Equipment_Setup_By_Line_Pack" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  line text not null,
  pack_size text not null,
  equipment_setup text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, line, pack_size)
);

create table if not exists "Reference"."CloseConfirm" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  value text not null,
  created_at timestamptz not null default now(),
  constraint close_confirm_allowed_value check (value in ('Yes', 'No', '')),
  primary key (org_id, value)
);

create index if not exists pack_sizes_org_id_idx
  on "Reference"."PackSizes" (org_id);

create index if not exists templates_org_id_idx
  on "Reference"."Templates" (org_id);

create index if not exists lines_by_pack_size_org_id_idx
  on "Reference"."Lines_By_PackSize" (org_id);

create index if not exists lines_by_pack_size_supported_pack_sizes_gin_idx
  on "Reference"."Lines_By_PackSize" using gin (supported_pack_sizes);

create index if not exists equipment_setup_by_line_pack_org_id_idx
  on "Reference"."Equipment_Setup_By_Line_Pack" (org_id);

create index if not exists close_confirm_org_id_idx
  on "Reference"."CloseConfirm" (org_id);

alter table "Reference"."PackSizes" enable row level security;
alter table "Reference"."PackSizes" force row level security;

drop policy if exists "PackSizes_org_context" on "Reference"."PackSizes";
create policy "PackSizes_org_context"
  on "Reference"."PackSizes"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table "Reference"."Templates" enable row level security;
alter table "Reference"."Templates" force row level security;

drop policy if exists "Templates_org_context" on "Reference"."Templates";
create policy "Templates_org_context"
  on "Reference"."Templates"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table "Reference"."Lines_By_PackSize" enable row level security;
alter table "Reference"."Lines_By_PackSize" force row level security;

drop policy if exists "Lines_By_PackSize_org_context" on "Reference"."Lines_By_PackSize";
create policy "Lines_By_PackSize_org_context"
  on "Reference"."Lines_By_PackSize"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table "Reference"."Equipment_Setup_By_Line_Pack" enable row level security;
alter table "Reference"."Equipment_Setup_By_Line_Pack" force row level security;

drop policy if exists "Equipment_Setup_By_Line_Pack_org_context" on "Reference"."Equipment_Setup_By_Line_Pack";
create policy "Equipment_Setup_By_Line_Pack_org_context"
  on "Reference"."Equipment_Setup_By_Line_Pack"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table "Reference"."CloseConfirm" enable row level security;
alter table "Reference"."CloseConfirm" force row level security;

drop policy if exists "CloseConfirm_org_context" on "Reference"."CloseConfirm";
create policy "CloseConfirm_org_context"
  on "Reference"."CloseConfirm"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."PackSizes" from public;
revoke all on "Reference"."Templates" from public;
revoke all on "Reference"."Lines_By_PackSize" from public;
revoke all on "Reference"."Equipment_Setup_By_Line_Pack" from public;
revoke all on "Reference"."CloseConfirm" from public;

revoke all on "Reference"."PackSizes" from app_user;
revoke all on "Reference"."Templates" from app_user;
revoke all on "Reference"."Lines_By_PackSize" from app_user;
revoke all on "Reference"."Equipment_Setup_By_Line_Pack" from app_user;
revoke all on "Reference"."CloseConfirm" from app_user;

grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."PackSizes" to app_user;
grant select, insert, update, delete on "Reference"."Templates" to app_user;
grant select, insert, update, delete on "Reference"."Lines_By_PackSize" to app_user;
grant select, insert, update, delete on "Reference"."Equipment_Setup_By_Line_Pack" to app_user;
grant select, insert, update, delete on "Reference"."CloseConfirm" to app_user;
