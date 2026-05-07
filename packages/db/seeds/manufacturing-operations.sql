-- Seed: Reference.ManufacturingOperations [APEX-CONFIG] per PRD §9.1 (ADR-028)
-- T-020 — 16 operations across 4 industries for the Apex org.
--
-- Pre-condition: public.organizations row with external_id = 'apex' must exist.
-- This seed is idempotent via ON CONFLICT (org_id, process_suffix) DO NOTHING.
--
-- Seed strategy: all 16 rows seeded to the single Apex org (external_id = 'apex').
-- UNIQUE (org_id, process_suffix) is enforced per-org; both bakery and fmcg
-- define an 'MX' suffix — because ON CONFLICT DO NOTHING is used, the second
-- occurrence of MX for the same org is silently skipped. Callers that require
-- strict per-industry isolation should register separate orgs.

do $$
declare
  v_apex_org_id uuid;
begin
  select id into v_apex_org_id
  from public.organizations
  where external_id = 'apex'
  limit 1;

  if v_apex_org_id is null then
    raise exception
      'Apex org not found (external_id = ''apex''). Run baseline org seed first.';
  end if;

  -- ── bakery industry ─────────────────────────────────────────────────────────
  insert into "Reference"."ManufacturingOperations"
    (org_id, operation_name, process_suffix, description, operation_seq,
     industry_code, is_active, marker)
  values
    (v_apex_org_id, 'Mix',   'MX', 'Ingredient mixing stage',       1, 'bakery', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Knead', 'KN', 'Dough kneading stage',          2, 'bakery', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Proof', 'PR', 'Dough proofing / fermentation',  3, 'bakery', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Bake',  'BK', 'Oven baking stage',              4, 'bakery', true, 'APEX-CONFIG')
  on conflict (org_id, process_suffix) do nothing;

  -- ── pharma industry ─────────────────────────────────────────────────────────
  insert into "Reference"."ManufacturingOperations"
    (org_id, operation_name, process_suffix, description, operation_seq,
     industry_code, is_active, marker)
  values
    (v_apex_org_id, 'Synthesis',      'SY', 'API synthesis reaction',           1, 'pharma', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Separation',     'SE', 'Phase separation / extraction',    2, 'pharma', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Crystallization','CZ', 'Crystallization and filtration',   3, 'pharma', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Drying',         'DR', 'Final drying and sizing',           4, 'pharma', true, 'APEX-CONFIG')
  on conflict (org_id, process_suffix) do nothing;

  -- ── fmcg industry ───────────────────────────────────────────────────────────
  insert into "Reference"."ManufacturingOperations"
    (org_id, operation_name, process_suffix, description, operation_seq,
     industry_code, is_active, marker)
  values
    (v_apex_org_id, 'Mix',   'MX', 'Blending and mixing',         1, 'fmcg', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Fill',  'FL', 'Container filling',           2, 'fmcg', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Seal',  'SL', 'Container sealing / capping', 3, 'fmcg', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Label', 'LB', 'Label application',           4, 'fmcg', true, 'APEX-CONFIG')
  on conflict (org_id, process_suffix) do nothing;

  -- ── generic industry ────────────────────────────────────────────────────────
  insert into "Reference"."ManufacturingOperations"
    (org_id, operation_name, process_suffix, description, operation_seq,
     industry_code, is_active, marker)
  values
    (v_apex_org_id, 'Process_A', 'PA', 'Generic processing step A', 1, 'generic', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Process_B', 'PB', 'Generic processing step B', 2, 'generic', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Process_C', 'PC', 'Generic processing step C', 3, 'generic', true, 'APEX-CONFIG'),
    (v_apex_org_id, 'Process_D', 'PD', 'Generic processing step D', 4, 'generic', true, 'APEX-CONFIG')
  on conflict (org_id, process_suffix) do nothing;

end $$;
