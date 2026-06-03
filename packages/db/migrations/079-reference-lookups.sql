-- Migration 079: 01-NPD reference lookup tables for cascade Chain 1.
-- PRD: docs/prd/01-NPD-PRD.md §4.1, §6.1, §7.2, §11.3.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

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

create table if not exists "Reference"."AlertThresholds" (
  org_id uuid not null references public.organizations(id) on delete cascade,
  level text not null,
  threshold_days integer not null,
  created_at timestamptz not null default now(),
  constraint alert_thresholds_allowed_level check (level in ('RED', 'YELLOW', 'GREEN')),
  constraint alert_thresholds_nonnegative_days check (threshold_days >= 0),
  primary key (org_id, level)
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

create index if not exists alert_thresholds_org_id_idx
  on "Reference"."AlertThresholds" (org_id);

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

alter table "Reference"."AlertThresholds" enable row level security;
alter table "Reference"."AlertThresholds" force row level security;

drop policy if exists "AlertThresholds_org_context" on "Reference"."AlertThresholds";
create policy "AlertThresholds_org_context"
  on "Reference"."AlertThresholds"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on "Reference"."PackSizes" from public;
revoke all on "Reference"."Templates" from public;
revoke all on "Reference"."Lines_By_PackSize" from public;
revoke all on "Reference"."Equipment_Setup_By_Line_Pack" from public;
revoke all on "Reference"."CloseConfirm" from public;
revoke all on "Reference"."AlertThresholds" from public;

revoke all on "Reference"."PackSizes" from app_user;
revoke all on "Reference"."Templates" from app_user;
revoke all on "Reference"."Lines_By_PackSize" from app_user;
revoke all on "Reference"."Equipment_Setup_By_Line_Pack" from app_user;
revoke all on "Reference"."CloseConfirm" from app_user;
revoke all on "Reference"."AlertThresholds" from app_user;

grant usage on schema "Reference" to app_user;
grant select, insert, update, delete on "Reference"."PackSizes" to app_user;
grant select, insert, update, delete on "Reference"."Templates" to app_user;
grant select, insert, update, delete on "Reference"."Lines_By_PackSize" to app_user;
grant select, insert, update, delete on "Reference"."Equipment_Setup_By_Line_Pack" to app_user;
grant select, insert, update, delete on "Reference"."CloseConfirm" to app_user;
grant select, insert, update, delete on "Reference"."AlertThresholds" to app_user;

create or replace function "Reference".seed_reference_lookup_defaults_for_org(target_org_id uuid)
returns void
language sql
security invoker
as $$
  insert into "Reference"."AlertThresholds" (org_id, level, threshold_days)
  values
    (target_org_id, 'RED', 10),
    (target_org_id, 'YELLOW', 21),
    (target_org_id, 'GREEN', 9999)
  on conflict (org_id, level) do nothing;
$$;

insert into "Reference"."AlertThresholds" (org_id, level, threshold_days)
select org.id, defaults.level, defaults.threshold_days
from public.organizations org
cross join (
  values
    ('RED'::text, 10),
    ('YELLOW'::text, 21),
    ('GREEN'::text, 9999)
) as defaults(level, threshold_days)
on conflict (org_id, level) do nothing;

create or replace function "Reference".seed_reference_lookup_defaults_on_org_insert()
returns trigger
language plpgsql
security invoker
as $$
begin
  perform "Reference".seed_reference_lookup_defaults_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists seed_reference_lookup_defaults_on_org_insert on public.organizations;
create trigger seed_reference_lookup_defaults_on_org_insert
  after insert on public.organizations
  for each row
  execute function "Reference".seed_reference_lookup_defaults_on_org_insert();

revoke all on function "Reference".seed_reference_lookup_defaults_for_org(uuid) from public;
revoke all on function "Reference".seed_reference_lookup_defaults_on_org_insert() from public;
