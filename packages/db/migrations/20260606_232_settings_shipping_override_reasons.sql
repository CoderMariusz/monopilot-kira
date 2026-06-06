-- Settings shipping override reasons data layer.
-- Local migration file only; do not apply to remote without operator approval.
-- Wave0 lock: org_id is the business scope. RLS via app.current_org_id().

create table if not exists public.shipping_override_types (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  code          text not null,
  label         text not null,
  description   text,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  constraint shipping_override_types_code_nonblank check (length(btrim(code)) > 0),
  constraint shipping_override_types_label_nonblank check (length(btrim(label)) > 0),
  constraint shipping_override_types_org_code_uq unique (org_id, code)
);

create index if not exists shipping_override_types_org_active_idx
  on public.shipping_override_types (org_id, is_active, display_order, code);

alter table public.shipping_override_types enable row level security;
alter table public.shipping_override_types force row level security;

drop policy if exists shipping_override_types_org_context_select on public.shipping_override_types;
create policy shipping_override_types_org_context_select on public.shipping_override_types
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists shipping_override_types_org_context_insert on public.shipping_override_types;
create policy shipping_override_types_org_context_insert on public.shipping_override_types
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists shipping_override_types_org_context_update on public.shipping_override_types;
create policy shipping_override_types_org_context_update on public.shipping_override_types
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists shipping_override_types_org_context_delete on public.shipping_override_types;
create policy shipping_override_types_org_context_delete on public.shipping_override_types
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.shipping_override_types from public;
grant select, insert, update, delete on public.shipping_override_types to app_user;

create table if not exists public.shipping_override_reasons (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  override_type_id uuid not null references public.shipping_override_types(id) on delete cascade,
  code             text not null,
  label            text not null,
  requires_note    boolean not null default false,
  display_order    integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default pg_catalog.now(),
  updated_at       timestamptz not null default pg_catalog.now(),
  created_by       uuid references public.users(id) on delete set null,
  updated_by       uuid references public.users(id) on delete set null,
  constraint shipping_override_reasons_code_nonblank check (length(btrim(code)) > 0),
  constraint shipping_override_reasons_label_nonblank check (length(btrim(label)) > 0),
  constraint shipping_override_reasons_org_type_code_uq unique (org_id, override_type_id, code)
);

create index if not exists shipping_override_reasons_org_type_active_idx
  on public.shipping_override_reasons (org_id, override_type_id, is_active, display_order, code);

alter table public.shipping_override_reasons enable row level security;
alter table public.shipping_override_reasons force row level security;

drop policy if exists shipping_override_reasons_org_context_select on public.shipping_override_reasons;
create policy shipping_override_reasons_org_context_select on public.shipping_override_reasons
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists shipping_override_reasons_org_context_insert on public.shipping_override_reasons;
create policy shipping_override_reasons_org_context_insert on public.shipping_override_reasons
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists shipping_override_reasons_org_context_update on public.shipping_override_reasons;
create policy shipping_override_reasons_org_context_update on public.shipping_override_reasons
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists shipping_override_reasons_org_context_delete on public.shipping_override_reasons;
create policy shipping_override_reasons_org_context_delete on public.shipping_override_reasons
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.shipping_override_reasons from public;
grant select, insert, update, delete on public.shipping_override_reasons to app_user;

create table if not exists public.rma_reason_codes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  code          text not null,
  label_en      text not null,
  label_pl      text,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  constraint rma_reason_codes_code_nonblank check (length(btrim(code)) > 0),
  constraint rma_reason_codes_label_en_nonblank check (length(btrim(label_en)) > 0),
  constraint rma_reason_codes_org_code_uq unique (org_id, code)
);

create index if not exists rma_reason_codes_org_active_idx
  on public.rma_reason_codes (org_id, is_active, display_order, code);

alter table public.rma_reason_codes enable row level security;
alter table public.rma_reason_codes force row level security;

drop policy if exists rma_reason_codes_org_context_select on public.rma_reason_codes;
create policy rma_reason_codes_org_context_select on public.rma_reason_codes
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists rma_reason_codes_org_context_insert on public.rma_reason_codes;
create policy rma_reason_codes_org_context_insert on public.rma_reason_codes
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists rma_reason_codes_org_context_update on public.rma_reason_codes;
create policy rma_reason_codes_org_context_update on public.rma_reason_codes
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists rma_reason_codes_org_context_delete on public.rma_reason_codes;
create policy rma_reason_codes_org_context_delete on public.rma_reason_codes
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.rma_reason_codes from public;
grant select, insert, update, delete on public.rma_reason_codes to app_user;

create or replace function public.shipping_override_reasons_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists shipping_override_types_set_updated_at on public.shipping_override_types;
create trigger shipping_override_types_set_updated_at
  before update on public.shipping_override_types
  for each row execute function public.shipping_override_reasons_set_updated_at();

drop trigger if exists shipping_override_reasons_set_updated_at on public.shipping_override_reasons;
create trigger shipping_override_reasons_set_updated_at
  before update on public.shipping_override_reasons
  for each row execute function public.shipping_override_reasons_set_updated_at();

drop trigger if exists rma_reason_codes_set_updated_at on public.rma_reason_codes;
create trigger rma_reason_codes_set_updated_at
  before update on public.rma_reason_codes
  for each row execute function public.shipping_override_reasons_set_updated_at();

insert into public.shipping_override_types (org_id, code, label, description, display_order)
select o.id, seed.code, seed.label, seed.description, seed.display_order
from public.organizations o
cross join (
  values
    ('fefo_deviation', 'FEFO deviation', 'Deviation from FEFO allocation or pick order', 10),
    ('expired_lp', 'Expired LP', 'Expired license plate exception', 20),
    ('quality_override', 'Quality override', 'Quality or hold gate override', 30),
    ('short_pick', 'Short pick', 'Short pick or partial allocation reason', 40),
    ('hold_place', 'Hold - place', 'Reason for placing shipping hold', 50),
    ('hold_release', 'Hold - release', 'Reason for releasing shipping hold', 60),
    ('cancel', 'SO cancel', 'Sales order cancellation reason', 70),
    ('reprint', 'Label reprint', 'Shipping label reprint reason', 80)
) as seed(code, label, description, display_order)
on conflict (org_id, code) do update
  set label = excluded.label,
      description = excluded.description,
      display_order = excluded.display_order,
      is_active = true,
      updated_at = pg_catalog.now();
