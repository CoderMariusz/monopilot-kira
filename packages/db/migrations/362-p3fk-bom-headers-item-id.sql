-- Migration 362 — P3-FK Phase A+B (additive foundation): bom_headers.item_id uuid FK + dual-write trigger.
-- Design: _meta/plans/2026-06-27-p3-fk-design.md §5.
--
-- The next merge phase repoints bom_headers from product_id (text product_code → product_legacy after mig-359)
-- to a real items.id uuid FK. This migration is the ADDITIVE, fully-reversible foundation: it adds a shadow
-- item_id column, backfills it from the items twin, adds the FK, and installs a BEFORE-trigger that keeps
-- item_id in sync with product_id on every write. ZERO reader/writer code change — product_id stays the live
-- surface; item_id is populated in parallel until Code Phase C switches the callsites (separate, review-gated,
-- with the cycle-detection identity swap done atomically). Mig D later drops product_id.
--
-- Pre-checked LIVE: every bom_headers.product_id has a matching items twin (0 orphans) → backfill is complete.
-- The FK on-delete mirrors the original product_id FK (RESTRICT).
--
-- Rollback (reverse order):
--   drop trigger if exists bom_headers_sync_item_id_trg on public.bom_headers;
--   drop function if exists public.bom_headers_sync_item_id();
--   alter table public.bom_headers drop constraint if exists bom_headers_item_id_fkey;
--   alter table public.bom_headers drop column if exists item_id;

-- A1. shadow column (nullable; no reader change).
alter table public.bom_headers
  add column if not exists item_id uuid;

-- A2. backfill from the items twin (item_code = product_id, org-scoped). Idempotent (only fills NULLs).
update public.bom_headers h
   set item_id = i.id
  from public.items i
 where i.org_id = h.org_id
   and i.item_code = h.product_id
   and h.product_id is not null
   and h.item_id is null;

-- A3. FK — references items(id); on-delete RESTRICT mirrors the original (org_id, product_id) → product FK.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bom_headers_item_id_fkey'
      and conrelid = 'public.bom_headers'::regclass
  ) then
    alter table public.bom_headers
      add constraint bom_headers_item_id_fkey
      foreign key (item_id) references public.items(id)
      on delete restrict;
  end if;
end $$;

-- B. dual-write trigger: keep item_id in sync with product_id on INSERT/UPDATE, so the current writers (which
--    still set only product_id) get a correct item_id for free during the Phase-C transition window. Only fills
--    a NULL item_id — product_id remains the source of truth until Phase C makes item_id authoritative.
create or replace function public.bom_headers_sync_item_id()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
begin
  if new.product_id is not null and new.item_id is null then
    select i.id into new.item_id
    from public.items i
    where i.org_id = new.org_id
      and i.item_code = new.product_id
    limit 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists bom_headers_sync_item_id_trg on public.bom_headers;
create trigger bom_headers_sync_item_id_trg
  before insert or update on public.bom_headers
  for each row execute function public.bom_headers_sync_item_id();
