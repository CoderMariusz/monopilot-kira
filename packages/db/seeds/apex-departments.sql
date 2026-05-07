-- Seed: Apex 7 departments [APEX-CONFIG] per PRD §9 (ADR-030)
-- T-019 — insert 7 Reference.Departments rows for the Apex org.
--
-- Pre-condition: public.organizations row with external_id = 'apex' must exist.
-- This seed is idempotent via ON CONFLICT DO NOTHING.

do $$
declare
  v_apex_org_id uuid;
begin
  select id into v_apex_org_id
  from public.organizations
  where external_id = 'apex'
  limit 1;

  if v_apex_org_id is null then
    raise exception 'Apex org not found (external_id = ''apex''). Run baseline org seed first.';
  end if;

  insert into "Reference"."Departments"
    (id, org_id, code, display_name, role_description, marker)
  values
    (
      gen_random_uuid(),
      v_apex_org_id,
      'core',
      'Core',
      'NPD orchestrator — Brief import → cascade to downstream departments',
      'APEX-CONFIG'
    ),
    (
      gen_random_uuid(),
      v_apex_org_id,
      'technical',
      'Technical',
      'Quality / spec definition (QA)',
      'APEX-CONFIG'
    ),
    (
      gen_random_uuid(),
      v_apex_org_id,
      'packaging',
      'Packaging',
      'Label, shelf-life, GS1 identifier management',
      'APEX-CONFIG'
    ),
    (
      gen_random_uuid(),
      v_apex_org_id,
      'mrp',
      'MRP',
      'Material planning and supplier sourcing',
      'APEX-CONFIG'
    ),
    (
      gen_random_uuid(),
      v_apex_org_id,
      'planning',
      'Planning',
      'PO/TO/WO schedule management',
      'APEX-CONFIG'
    ),
    (
      gen_random_uuid(),
      v_apex_org_id,
      'production',
      'Production',
      'WO execution spec (distinct from 08-PRODUCTION module execution)',
      'APEX-CONFIG'
    ),
    (
      gen_random_uuid(),
      v_apex_org_id,
      'price',
      'Price',
      'Final pricing and margin validation',
      'APEX-CONFIG'
    )
  on conflict (org_id, code) do nothing;
end $$;
