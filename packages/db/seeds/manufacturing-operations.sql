-- Seed: Reference.ManufacturingOperations [APEX-CONFIG] per PRD §4.5 + Appendix A.
-- T-004 — per-org industry defaults for Bakery / Pharmacy / FMCG only.
--
-- This seed is idempotent and intentionally derives org_id from
-- public.organizations.

insert into "Reference"."ManufacturingOperations"
  (org_id, operation_name, process_suffix, description, operation_seq,
   industry_code, is_active, marker)
select org.id,
       seed.operation_name,
       seed.process_suffix,
       seed.description,
       seed.operation_seq,
       seed.industry_code,
       true,
       'APEX-CONFIG'
from public.organizations org
join (
  values
    ('bakery', 'Mix', 'MX', 'Ingredient mixing stage', 1),
    ('bakery', 'Knead', 'KN', 'Dough kneading stage', 2),
    ('bakery', 'Proof', 'PR', 'Dough proofing / fermentation', 3),
    ('bakery', 'Bake', 'BK', 'Oven baking stage', 4),
    ('pharma', 'Synthesis', 'SY', 'API synthesis reaction', 1),
    ('pharma', 'Separation', 'SE', 'Phase separation / extraction', 2),
    ('pharma', 'Crystallization', 'CZ', 'Crystallization and filtration', 3),
    ('pharma', 'Drying', 'DR', 'Final drying and sizing', 4),
    ('fmcg', 'Mix', 'MX', 'Blending and mixing', 1),
    ('fmcg', 'Fill', 'FL', 'Container filling', 2),
    ('fmcg', 'Seal', 'SL', 'Container sealing / capping', 3),
    ('fmcg', 'Label', 'LB', 'Label application', 4)
) as seed(industry_code, operation_name, process_suffix, description, operation_seq)
  on seed.industry_code = org.industry_code
on conflict (org_id, operation_name) do update
  set process_suffix = excluded.process_suffix,
      description = excluded.description,
      operation_seq = excluded.operation_seq,
      industry_code = excluded.industry_code,
      is_active = true,
      marker = 'APEX-CONFIG';
