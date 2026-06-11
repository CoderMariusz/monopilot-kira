-- Migration 283: transfer_order_line_lps — TO ship/receive LP linkage (W9-K-II, F-C05).
--
-- Before this migration, TO "receive" was a bare status flip (audit F-C05 HIGH):
-- no stock left the source warehouse and none appeared at the destination —
-- phantom stock from clicking. The smallest honest model the schema supports:
--   * SHIP  (draft → in_transit): FEFO-pick available source LPs per line,
--     decrement them (full depletion → status 'shipped'), and record WHAT was
--     taken from WHICH LP here (source_lp_id + qty). Availability is validated
--     server-side (reject qty > available at source).
--   * RECEIVE (in_transit → received): for every row here, create a destination
--     LP at to_warehouse (origin 'transfer', parent_lp_id = source LP for
--     genealogy, batch/expiry carried over) and back-link dest_lp_id.
--   * CANCEL (in_transit → cancelled): restore source LP quantities and delete
--     the rows (no stranded in-transit stock).
-- transfer_order_lines stays item+qty (no lp_id column) — one TO line can ship
-- from MANY LPs, so the linkage is a junction, not a line column.
--
-- Wave0 lock: org_id is the business scope; RLS via app.current_org_id()
-- (NEVER raw current_setting). FKs: transfer order tables (263) and
-- license_plates (191) already exist — hard FKs are safe here.

create table if not exists public.transfer_order_line_lps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  to_id         uuid not null references public.transfer_orders(id) on delete cascade,
  to_line_id    uuid not null references public.transfer_order_lines(id) on delete cascade,

  -- Source LP the shipped quantity was taken from (set at ship time).
  source_lp_id  uuid not null references public.license_plates(id) on delete cascade,
  -- Destination LP created at receive time (null while in transit).
  dest_lp_id    uuid references public.license_plates(id) on delete set null,

  qty           numeric(18, 6) not null,
  uom           text not null,

  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),

  -- One pick per (line, source LP): ship happens exactly once per TO (state
  -- machine: draft → in_transit is the only entry), so this doubles as the
  -- idempotency guard against double-allocation.
  constraint transfer_order_line_lps_line_source_unique unique (org_id, to_line_id, source_lp_id),
  constraint transfer_order_line_lps_qty_positive_check check (qty > 0)
);

create index if not exists transfer_order_line_lps_org_to_idx
  on public.transfer_order_line_lps (org_id, to_id);
create index if not exists transfer_order_line_lps_line_idx
  on public.transfer_order_line_lps (org_id, to_line_id);
create index if not exists transfer_order_line_lps_source_lp_idx
  on public.transfer_order_line_lps (source_lp_id);
create index if not exists transfer_order_line_lps_dest_lp_idx
  on public.transfer_order_line_lps (dest_lp_id) where dest_lp_id is not null;

alter table public.transfer_order_line_lps enable row level security;
alter table public.transfer_order_line_lps force row level security;

drop policy if exists transfer_order_line_lps_org_context on public.transfer_order_line_lps;
create policy transfer_order_line_lps_org_context
  on public.transfer_order_line_lps
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.transfer_order_line_lps from public;
revoke all on public.transfer_order_line_lps from app_user;
grant select, insert, update, delete on public.transfer_order_line_lps to app_user;

drop trigger if exists transfer_order_line_lps_set_updated_at on public.transfer_order_line_lps;
create trigger transfer_order_line_lps_set_updated_at
  before update on public.transfer_order_line_lps
  for each row execute function public.planning_procurement_set_updated_at();

comment on table public.transfer_order_line_lps is
  'TO ship/receive LP linkage (W9-K-II, F-C05): which source LPs a TO line shipped from '
  '(qty decremented at ship) and which destination LP was created at receive. '
  'dest_lp_id null = in transit.';
