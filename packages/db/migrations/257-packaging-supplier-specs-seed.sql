-- Migration 257: approved demo supplier specs for the packaging catalog.
--
-- Live QA (2026-06-10): the mig-255 PKG-* demo items could not be added to any
-- BOM — validateRmUsability AC2 hard-blocks components without an APPROVED
-- public.supplier_specs row (SUPPLIER_NOT_APPROVED), and the packaging seed
-- shipped without specs. Same data gap (and same fix shape) as migration 251
-- for the food catalog. Idempotent via the partial unique index
-- supplier_specs_one_active_approved (org_id, item_id, supplier_code) where
-- lifecycle_status='active' and review_status='approved' (mig 162).

insert into public.supplier_specs
  (org_id, item_id, supplier_code, supplier_status, spec_version,
   issued_date, effective_from, expiry_date, lifecycle_status, review_status,
   review_notes, declared_attrs, certificate_refs)
select
  i.org_id,
  i.id,
  'SUP-PKG-01',
  'approved',
  'demo-v1',
  date '2026-01-01',
  date '2026-01-01',
  date '2031-01-01',
  'active',
  'approved',
  'Demo approved packaging supplier spec seeded for BOM authoring gates.',
  jsonb_build_object('source', '257-packaging-supplier-specs-seed'),
  jsonb_build_array(jsonb_build_object('type', 'demo_supplier_approval', 'ref', 'SUP-PKG-01'))
from public.items i
where i.org_id = '00000000-0000-0000-0000-000000000002'::uuid
  and i.item_type = 'packaging'
on conflict (org_id, item_id, supplier_code)
  where lifecycle_status = 'active' and review_status = 'approved'
do update
  set supplier_status     = 'approved',
      spec_version        = excluded.spec_version,
      issued_date         = excluded.issued_date,
      effective_from      = excluded.effective_from,
      expiry_date         = excluded.expiry_date,
      lifecycle_status    = 'active',
      review_status       = 'approved',
      review_notes        = excluded.review_notes,
      declared_attrs      = excluded.declared_attrs,
      certificate_refs    = excluded.certificate_refs,
      cost_review_blocked = false,
      spec_review_blocked = false,
      updated_at          = pg_catalog.now();
