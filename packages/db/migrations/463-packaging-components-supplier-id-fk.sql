-- 463-packaging-components-supplier-id-fk.sql
-- Link packaging_components to the operational supplier master (same pattern as mig 398
-- supplier_specs). supplier_code remains as a denormalized code + legacy free-text
-- fallback; supplier_id is the canonical FK for new/edited rows.
-- Wave0 org boundary: composite FK (org_id, supplier_id) → suppliers(org_id, id).

-- Unique target for org-scoped FK (id alone is globally unique; this pins org boundary).
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'suppliers_org_id_id_unique'
       and conrelid = 'public.suppliers'::regclass
  ) then
    alter table public.suppliers
      add constraint suppliers_org_id_id_unique unique (org_id, id);
  end if;
end $$;

alter table public.packaging_components
  add column if not exists supplier_id uuid;

-- Drop a plain id-only FK if a prior partial apply created one.
do $$
declare
  fk_name text;
begin
  for fk_name in
    select c.conname
      from pg_constraint c
     where c.contype = 'f'
       and c.conrelid = 'public.packaging_components'::regclass
       and c.conname like '%supplier_id%'
       and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table public.packaging_components drop constraint if exists %I', fk_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'packaging_components_org_supplier_id_fkey'
       and conrelid = 'public.packaging_components'::regclass
  ) then
    alter table public.packaging_components
      add constraint packaging_components_org_supplier_id_fkey
      foreign key (org_id, supplier_id)
      references public.suppliers (org_id, id)
      on delete restrict;
  end if;
end $$;

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
