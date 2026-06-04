-- Migration 170: 03-Technical — allergen cascade rule deployment (T-024).
-- PRD: docs/prd/03-TECHNICAL-PRD.md §10.2, §10.3, §10.8.
--
-- Deploys the Technical allergen cascade RULE DEFINITION into public.rule_definitions
-- (the L1 rule registry created by 02-SETTINGS migration 039) for every existing org,
-- plus an AFTER-INSERT trigger so new orgs receive it automatically. The rule's
-- definition_json describes the cascade contract the handler (lib/technical/allergens/cascade.ts)
-- executes; the handler is the runtime, this row is the deployed, versioned policy.
--
-- CASCADE CONTRACT (what the handler does — encoded here for audit/registry):
--   trigger : a raw-material / intermediate item's allergen profile changes
--             (item_allergen_profiles; item_type lives on items, joined via item_id)
--   compute : for every ACTIVE BOM whose product (FG/intermediate) transitively
--             contains the changed component, aggregate:
--               * component allergens (item_allergen_profiles of bom_lines.item_id),
--               * manufacturing-operation additions
--                 (manufacturing_operation_allergen_additions joined on
--                  bom_lines.manufacturing_operation_name),
--             then UPSERT source='cascaded' rows onto the parent's profile.
--   protect : NEVER overwrite source='manual_override' rows (V-TEC-42). A cascaded
--             write to an allergen_code that already carries a manual_override is skipped.
--   KPI     : propagation completes <= 5s (RM -> intermediate -> FG).
--
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Technical CONSUMES 01-NPD's materialized product.allergens (read-only) and does NOT
-- recompute the NPD aggregate — this rule operates on the Technical item/BOM/profile layer.

-- The canonical rule_code + the definition_json the handler reads.
do $$
declare
  v_rule_code text := 'technical.allergen_cascade';
  v_definition jsonb := jsonb_build_object(
    'rule_code', 'technical.allergen_cascade',
    'description', 'Technical allergen full cascade: RM/intermediate profile change -> active BOM parents -> cascaded FG profile rows; manufacturing-op additions UNIONed; manual_override rows never overwritten.',
    'trigger_event', 'technical.item_allergen_profile.changed',
    'sources', jsonb_build_array('item_allergen_profiles', 'manufacturing_operation_allergen_additions', 'bom_headers', 'bom_lines'),
    'target', 'item_allergen_profiles',
    'cascaded_source_label', 'cascaded',
    'override_protected_source', 'manual_override',
    'kpi_max_ms', 5000,
    'handler', 'apps/web/lib/technical/allergens/cascade.ts'
  );
begin
  -- Backfill: one active rule row per existing org (idempotent on the unique
  -- (org_id, rule_code, version) key).
  insert into public.rule_definitions (org_id, rule_code, rule_type, tier, definition_json, version)
  select o.id, v_rule_code, 'cascading', 'L1', v_definition, 1
    from public.organizations o
  on conflict (org_id, rule_code, version) do nothing;
end
$$;

-- AFTER-INSERT trigger: new orgs auto-receive the deployed cascade rule.
create or replace function public.seed_allergen_cascade_rule_for_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_definition jsonb := jsonb_build_object(
    'rule_code', 'technical.allergen_cascade',
    'description', 'Technical allergen full cascade: RM/intermediate profile change -> active BOM parents -> cascaded FG profile rows; manufacturing-op additions UNIONed; manual_override rows never overwritten.',
    'trigger_event', 'technical.item_allergen_profile.changed',
    'sources', jsonb_build_array('item_allergen_profiles', 'manufacturing_operation_allergen_additions', 'bom_headers', 'bom_lines'),
    'target', 'item_allergen_profiles',
    'cascaded_source_label', 'cascaded',
    'override_protected_source', 'manual_override',
    'kpi_max_ms', 5000,
    'handler', 'apps/web/lib/technical/allergens/cascade.ts'
  );
begin
  insert into public.rule_definitions (org_id, rule_code, rule_type, tier, definition_json, version)
  values (new.id, 'technical.allergen_cascade', 'cascading', 'L1', v_definition, 1)
  on conflict (org_id, rule_code, version) do nothing;
  return new;
end
$$;

drop trigger if exists seed_allergen_cascade_rule_after_org_insert on public.organizations;
create trigger seed_allergen_cascade_rule_after_org_insert
  after insert on public.organizations
  for each row execute function public.seed_allergen_cascade_rule_for_org();
