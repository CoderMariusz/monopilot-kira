-- 398-supplier-specs-supplier-id-fk.sql
-- DB cleanup audit Phase 3 — link supplier_specs to the operational supplier master.
-- supplier_specs.supplier_code is a loose TEXT handle with no FK; public.suppliers
-- (org_id, code) is UNIQUE so the supplier_id backfill is a deterministic 1:1 lookup.
-- Additive + nullable: any supplier_code with no matching supplier stays NULL and the
-- loose text column remains as the fallback. No destructive change; the text column is
-- intentionally NOT dropped (readers keep a code-join fallback).
alter table public.supplier_specs
  add column if not exists supplier_id uuid references public.suppliers(id);

create index if not exists idx_supplier_specs_supplier_id
  on public.supplier_specs (org_id, supplier_id)
  where supplier_id is not null;

-- Backfill from the existing text supplier_code (per org, deterministic via the unique
-- (org_id, code) on public.suppliers). Non-matching codes are left NULL.
update public.supplier_specs ss
   set supplier_id = s.id
  from public.suppliers s
 where s.org_id = ss.org_id
   and s.code = ss.supplier_code
   and ss.supplier_id is null;
