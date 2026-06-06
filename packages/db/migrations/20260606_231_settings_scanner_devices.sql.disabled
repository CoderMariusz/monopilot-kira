-- Settings scanner devices data layer.
-- Local migration file only; do not apply to remote without operator approval.

create table if not exists public.scanner_devices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  model         text not null,
  site_id       uuid references public.sites(id) on delete set null,
  line_id       text,
  battery_level integer not null default 100,
  last_seen_at  timestamptz,
  status        text not null default 'offline',
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  constraint scanner_devices_status_check check (status in ('online', 'offline', 'low_battery')),
  constraint scanner_devices_battery_check check (battery_level between 0 and 100)
);

create index if not exists scanner_devices_org_idx on public.scanner_devices (org_id);
create index if not exists scanner_devices_org_status_idx on public.scanner_devices (org_id, status);
create index if not exists scanner_devices_org_site_idx on public.scanner_devices (org_id, site_id);

alter table public.scanner_devices enable row level security;
alter table public.scanner_devices force row level security;

drop policy if exists scanner_devices_org_context_select on public.scanner_devices;
create policy scanner_devices_org_context_select on public.scanner_devices
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists scanner_devices_org_context_insert on public.scanner_devices;
create policy scanner_devices_org_context_insert on public.scanner_devices
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists scanner_devices_org_context_update on public.scanner_devices;
create policy scanner_devices_org_context_update on public.scanner_devices
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists scanner_devices_org_context_delete on public.scanner_devices;
create policy scanner_devices_org_context_delete on public.scanner_devices
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.scanner_devices from public;
grant select, insert, update, delete on public.scanner_devices to app_user;

drop trigger if exists scanner_devices_set_updated_at on public.scanner_devices;
create trigger scanner_devices_set_updated_at
  before update on public.scanner_devices
  for each row execute function public.oee_set_updated_at();

create table if not exists public.scanner_device_defaults (
  org_id            uuid primary key references public.organizations(id) on delete cascade,
  auto_lock_minutes integer not null default 5,
  login_per_shift   boolean not null default true,
  offline_mode      boolean not null default true,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),
  updated_by        uuid references public.users(id) on delete set null,
  constraint scanner_device_defaults_auto_lock_check check (auto_lock_minutes between 1 and 240)
);

alter table public.scanner_device_defaults enable row level security;
alter table public.scanner_device_defaults force row level security;

drop policy if exists scanner_device_defaults_org_context_select on public.scanner_device_defaults;
create policy scanner_device_defaults_org_context_select on public.scanner_device_defaults
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists scanner_device_defaults_org_context_insert on public.scanner_device_defaults;
create policy scanner_device_defaults_org_context_insert on public.scanner_device_defaults
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists scanner_device_defaults_org_context_update on public.scanner_device_defaults;
create policy scanner_device_defaults_org_context_update on public.scanner_device_defaults
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.scanner_device_defaults from public;
grant select, insert, update on public.scanner_device_defaults to app_user;

drop trigger if exists scanner_device_defaults_set_updated_at on public.scanner_device_defaults;
create trigger scanner_device_defaults_set_updated_at
  before update on public.scanner_device_defaults
  for each row execute function public.oee_set_updated_at();
