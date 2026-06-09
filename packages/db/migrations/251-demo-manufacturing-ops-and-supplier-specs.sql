-- 251-demo-manufacturing-ops-and-supplier-specs.sql
--
-- Live corrective seed for the canonical demo org:
--   1. Reference.ManufacturingOperations had no seeded rows visible to the BOM
--      authoring picker. Seed meat-industry operations idempotently.
--   2. public.supplier_specs had no approved specs for the NPD ingredient catalog,
--      so the RM usability gate correctly blocked all components as
--      SUPPLIER_NOT_APPROVED. Seed one approved demo supplier spec per catalog item.
--
-- Wave0 lock: org_id is the business scope; RLS continues to use app.current_org_id().

insert into "Reference"."ManufacturingOperations"
  (org_id, operation_name, process_suffix, description, operation_seq, industry_code, is_active, marker)
select
  '00000000-0000-0000-0000-000000000002'::uuid,
  v.operation_name,
  v.process_suffix,
  v.description,
  v.operation_seq,
  'fmcg',
  true,
  'APEX-CONFIG'
from (values
  ('Mixing',          'MX', 'Batch mixing / seasoning blend',          1),
  ('Grinding',        'GR', 'Meat grinding / mincing',                 2),
  ('Stuffing',        'ST', 'Stuffing into casing or mould',           3),
  ('Smoking',         'SM', 'Smokehouse process step',                 4),
  ('Cooking',         'CK', 'Thermal cooking step',                    5),
  ('Chilling',        'CH', 'Rapid chill / tempering',                 6),
  ('Slicing',         'SL', 'Slicing / portioning',                    7),
  ('Packing',         'PK', 'Primary or secondary packing',            8),
  ('Labelling',       'LB', 'Product labelling / sleeve application',  9),
  ('Metal detection', 'MD', 'Metal detection / CCP release check',    10)
) as v(operation_name, process_suffix, description, operation_seq)
-- The table has TWO unique constraints (org+industry+suffix AND org+operation_name);
-- ON CONFLICT can target only one, and the live org already holds a hand-inserted
-- 'Mixing' row that collides by NAME with a different suffix — so idempotence is
-- done via NOT EXISTS across both keys instead.
where not exists (
  select 1
    from "Reference"."ManufacturingOperations" m
   where m.org_id = '00000000-0000-0000-0000-000000000002'::uuid
     and (
       m.operation_name = v.operation_name
       or (m.industry_code = 'fmcg' and m.process_suffix = v.process_suffix)
     )
);

insert into public.supplier_specs
  (org_id, item_id, supplier_code, supplier_status, spec_version,
   issued_date, effective_from, expiry_date, lifecycle_status, review_status,
   review_notes, declared_attrs, certificate_refs)
select
  i.org_id,
  i.id,
  'SUP-DEMO-01',
  'approved',
  'demo-v1',
  date '2026-01-01',
  date '2026-01-01',
  date '2031-01-01',
  'active',
  'approved',
  'Demo approved supplier spec seeded for BOM authoring gates.',
  jsonb_build_object('source', '251-demo-manufacturing-ops-and-supplier-specs'),
  jsonb_build_array(jsonb_build_object('type', 'demo_supplier_approval', 'ref', 'SUP-DEMO-01'))
from public.items i
where i.org_id = '00000000-0000-0000-0000-000000000002'::uuid
  and i.item_code in (
    'RM-BEEF-80',
    'RM-BEEF-50',
    'RM-BEEF-MDM',
    'RM-PORK-90',
    'RM-PORK-70',
    'RM-PORK-SHLD',
    'RM-PORK-FAT',
    'RM-CHKN-BR',
    'RM-CHKN-MDM',
    'RM-WATER-ICE',
    'ING-CURE-SALT',
    'ING-SEA-SALT',
    'ING-DEXTROSE',
    'ING-STPP',
    'ING-ASCORBATE',
    'ING-ERYTHORB',
    'ING-MSG',
    'ING-SUGAR',
    'SP-PEPPER-BLK',
    'SP-PEPPER-WHT',
    'SP-GARLIC',
    'SP-ONION',
    'SP-PAPRIKA',
    'SP-NUTMEG',
    'SP-CORIANDER',
    'SP-MARJORAM',
    'SP-MUSTARD',
    'FN-POTATO-ST',
    'FN-SOY-ISO',
    'FN-CARRAGEEN',
    'FN-SMOKE',
    'FN-CULTURE',
    'FN-HOG-CASING',
    'E2E-ITEM-0609'
  )
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
