-- WAVE SW foundation (owner-decided: app-level site scoping, not RLS).
-- Production lines gain a direct warehouse_id (fixes "lines don't show after adding a warehouse",
-- which derived warehouse only through default_location_id). Warehouses gain a site_id so the
-- top-bar site can scope warehouses app-side.
-- Applied live via Supabase MCP 2026-06-23; file added for repo/DB parity.

alter table public.production_lines
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null;

alter table public.warehouses
  add column if not exists site_id uuid references public.sites(id) on delete set null;

-- Backfill existing lines' warehouse from their default location's warehouse.
update public.production_lines pl
set warehouse_id = l.warehouse_id
from public.locations l
where pl.default_location_id = l.id
  and pl.warehouse_id is null
  and l.warehouse_id is not null;

create index if not exists idx_production_lines_warehouse_id on public.production_lines(warehouse_id);
create index if not exists idx_warehouses_site_id on public.warehouses(site_id);
