-- Migration 380 — site_id insert safety-net triggers for the REMAINING site-scoped entities.
--
-- Extends mig 379 (work_orders) to the other entities whose LIST/KPI reads were site-scoped but whose
-- CREATE paths never SET site_id — the same latent data-disappearance class: a newly-created row would be
-- NULL-site and silently vanish from the site-filtered list/KPI. All 5 are LATENT today (0 NULL-site rows
-- live). Audited 2026-06-28: quality_inspections / ncr_reports / shipments already SET site_id in their
-- write paths (no trigger needed); transfer_orders are org-wide by design (no site_id dimension).
--
-- Each trigger fills a NULL site_id from the entity's natural site source, falling back to the org default
-- site (public.sites where is_default = true — same source as mig 369). Explicit site_id inserts
-- short-circuit via coalesce(new.site_id, ...), so the already-correct write paths are untouched and the
-- trigger body's subqueries only run when site_id is NULL. RLS/role-agnostic: subqueries filter by
-- new.org_id explicitly. Idempotent backfills heal any NULL-site rows (today all no-ops; behaviour-preserving).
--
--   purchase_orders  → destination warehouse's site (warehouses.site_id via destination_warehouse_id)
--   grns             → receiving warehouse's site  (warehouses.site_id via warehouse_id)
--   stock_moves      → moved LP's site             (license_plates.site_id via lp_id)   [shared fn]
--   lp_state_history → transitioned LP's site      (license_plates.site_id via lp_id)   [shared fn]
--   quality_holds    → referenced LP's site when reference_type='lp', else org default

-- ── purchase_orders ──────────────────────────────────────────────────────────
create or replace function public.purchase_orders_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select w.site_id from public.warehouses w
        where w.id = new.destination_warehouse_id and w.org_id = new.org_id),
      (select s.id from public.sites s
        where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;
drop trigger if exists purchase_orders_default_site_id on public.purchase_orders;
create trigger purchase_orders_default_site_id
  before insert on public.purchase_orders
  for each row execute function public.purchase_orders_default_site_id();

-- ── grns ─────────────────────────────────────────────────────────────────────
create or replace function public.grns_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select w.site_id from public.warehouses w
        where w.id = new.warehouse_id and w.org_id = new.org_id),
      (select s.id from public.sites s
        where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;
drop trigger if exists grns_default_site_id on public.grns;
create trigger grns_default_site_id
  before insert on public.grns
  for each row execute function public.grns_default_site_id();

-- ── stock_moves + lp_state_history (shared: site from the LP being moved) ─────
create or replace function public.set_site_id_from_lp()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select lp.site_id from public.license_plates lp
        where lp.id = new.lp_id and lp.org_id = new.org_id),
      (select s.id from public.sites s
        where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;
drop trigger if exists stock_moves_default_site_id on public.stock_moves;
create trigger stock_moves_default_site_id
  before insert on public.stock_moves
  for each row execute function public.set_site_id_from_lp();
drop trigger if exists lp_state_history_default_site_id on public.lp_state_history;
create trigger lp_state_history_default_site_id
  before insert on public.lp_state_history
  for each row execute function public.set_site_id_from_lp();

-- ── quality_holds (site from the referenced LP for lp-holds, else org default) ─
create or replace function public.quality_holds_default_site_id()
 returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select lp.site_id from public.license_plates lp
        where lp.id = new.reference_id and lp.org_id = new.org_id and new.reference_type = 'lp'),
      (select s.id from public.sites s
        where s.org_id = new.org_id and s.is_default = true order by s.id limit 1)
    );
  end if;
  return new;
end;
$function$;
drop trigger if exists quality_holds_default_site_id on public.quality_holds;
create trigger quality_holds_default_site_id
  before insert on public.quality_holds
  for each row execute function public.quality_holds_default_site_id();

-- ── Idempotent backfills (today all no-ops: 0 NULL-site rows) ─────────────────
update public.purchase_orders po set site_id = coalesce(
    (select w.site_id from public.warehouses w where w.id = po.destination_warehouse_id and w.org_id = po.org_id),
    (select s.id from public.sites s where s.org_id = po.org_id and s.is_default = true order by s.id limit 1))
 where po.site_id is null;

update public.grns g set site_id = coalesce(
    (select w.site_id from public.warehouses w where w.id = g.warehouse_id and w.org_id = g.org_id),
    (select s.id from public.sites s where s.org_id = g.org_id and s.is_default = true order by s.id limit 1))
 where g.site_id is null;

update public.stock_moves sm set site_id = coalesce(
    (select lp.site_id from public.license_plates lp where lp.id = sm.lp_id and lp.org_id = sm.org_id),
    (select s.id from public.sites s where s.org_id = sm.org_id and s.is_default = true order by s.id limit 1))
 where sm.site_id is null;

update public.lp_state_history h set site_id = coalesce(
    (select lp.site_id from public.license_plates lp where lp.id = h.lp_id and lp.org_id = h.org_id),
    (select s.id from public.sites s where s.org_id = h.org_id and s.is_default = true order by s.id limit 1))
 where h.site_id is null;

update public.quality_holds qh set site_id = coalesce(
    (select lp.site_id from public.license_plates lp where lp.id = qh.reference_id and lp.org_id = qh.org_id and qh.reference_type = 'lp'),
    (select s.id from public.sites s where s.org_id = qh.org_id and s.is_default = true order by s.id limit 1))
 where qh.site_id is null;
