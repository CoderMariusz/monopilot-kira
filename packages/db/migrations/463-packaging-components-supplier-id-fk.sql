-- 463-packaging-components-supplier-id-fk.sql
-- Link packaging_components to the operational supplier master (same pattern as mig 398
-- supplier_specs). supplier_code remains as a denormalized code + legacy free-text
-- fallback; supplier_id is the canonical FK for new/edited rows.
alter table public.packaging_components
  add column if not exists supplier_id uuid references public.suppliers(id);

create index if not exists idx_packaging_components_supplier_id
  on public.packaging_components (org_id, supplier_id)
  where supplier_id is not null;

-- Backfill from existing text supplier_code where it matches (org_id, code) on suppliers.
update public.packaging_components pc
   set supplier_id = s.id
  from public.suppliers s
 where s.org_id = pc.org_id
   and s.code = pc.supplier_code
   and pc.supplier_id is null
   and pc.supplier_code is not null;
