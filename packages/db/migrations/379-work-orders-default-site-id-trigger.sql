-- Migration 379 — work_orders.site_id insert safety-net (close the site-scoping WRITE-PATH gap).
--
-- The planning WO list (listPlanningWorkOrders.ts) + schedule board (schedule-board.ts) filter
-- `wo.site_id = <active site>` DIRECTLY (no coalesce fallback); the production list uses
-- coalesce(w.site_id, pl.site_id). mig 369 backfilled EXISTING work_orders.site_id to the org default
-- site, but the create paths (createWorkOrder, MRP createWorkOrder, WO import) NEVER set site_id — so
-- every NEWLY created work order has site_id NULL and silently VANISHES from the planning list + schedule
-- board the moment a site is active (a latent data-disappearance: 0 NULL rows today because no WO has been
-- created since the mig-369 backfill, but the next create would trigger it).
--
-- Rather than patch each TS insert (and miss future paths — scanner / MRP / import), install ONE
-- BEFORE INSERT trigger that fills a NULL site_id from the WO's production line's site, falling back to
-- the org default site. This mirrors the production list's coalesce(w.site_id, pl.site_id) AND mig 369's
-- backfill source (public.sites where is_default = true). Explicit site_id inserts are UNTOUCHED
-- (coalesce(new.site_id, ...) short-circuits). RLS-safe + role-agnostic: the subqueries filter by
-- new.org_id explicitly (not the GUC), so they resolve the inserter's own org regardless of role.
--
-- Idempotent re-backfill included (today a no-op: 0 NULL rows) so any row created between mig 369 and
-- this trigger is healed. Behaviour-preserving for existing data (all current WOs already carry site_id).

create or replace function public.work_orders_default_site_id()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  if new.site_id is null then
    new.site_id := coalesce(
      (select pl.site_id
         from public.production_lines pl
        where pl.id = new.production_line_id
          and pl.org_id = new.org_id),
      (select s.id
         from public.sites s
        where s.org_id = new.org_id
          and s.is_default = true
        order by s.id
        limit 1)
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists work_orders_default_site_id on public.work_orders;
create trigger work_orders_default_site_id
  before insert on public.work_orders
  for each row execute function public.work_orders_default_site_id();

-- Heal any NULL-site rows created between mig 369 and this trigger (same source as the trigger).
update public.work_orders wo
   set site_id = coalesce(
     (select pl.site_id
        from public.production_lines pl
       where pl.id = wo.production_line_id
         and pl.org_id = wo.org_id),
     (select s.id
        from public.sites s
       where s.org_id = wo.org_id
         and s.is_default = true
       order by s.id
       limit 1)
   )
 where wo.site_id is null;
