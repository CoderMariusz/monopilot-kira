-- Owner rulings D36/D37 (2026-07-03): remap misplaced gate checklist items to correct stages; sync open projects preserving checked state; refresh seed trigger.

-- Migration 426: Gate checklist stage remap and open-project sync.
-- Re-entrant by design:
--   * template moves are guarded by the current old gate_code;
--   * open project inserts are anti-joined by project + item_text;
--   * open project updates only set canonical template values;
--   * open project deletes only remove unchecked rows absent from the current template set;
--   * seed functions use anti-join + ON CONFLICT DO NOTHING.

-- Idempotency: guarded on gate_code = 'G2', so once these rows have moved to G3
-- a re-run finds no source rows; target sequence is computed once at move time.
with moved as (
  select t.ctid,
         t.org_id,
         t.template_id,
         row_number() over (
           partition by t.org_id, t.template_id
           order by t.sequence, t.item_text
         ) as move_ordinal
    from "Reference"."GateChecklistTemplates" t
   where t.gate_code = 'G2'
     and t.item_text in (
       'Shelf life assessment',
       'Packaging compatibility check',
       'Target cost approved',
       'Target margin confirmed',
       'Initial label requirements'
     )
),
target_max as (
  select t.org_id,
         t.template_id,
         coalesce(max(t.sequence), 0) as max_sequence
    from "Reference"."GateChecklistTemplates" t
   where t.gate_code = 'G3'
   group by t.org_id, t.template_id
)
update "Reference"."GateChecklistTemplates" t
   set gate_code = 'G3',
       sequence = coalesce(tm.max_sequence, 0) + moved.move_ordinal
  from moved
  left join target_max tm
    on tm.org_id = moved.org_id
   and tm.template_id = moved.template_id
 where t.ctid = moved.ctid;

-- Idempotency: guarded on gate_code = 'G3', so once these rows have moved to G4
-- a re-run finds no source rows; target sequence is computed once at move time.
with moved as (
  select t.ctid,
         t.org_id,
         t.template_id,
         row_number() over (
           partition by t.org_id, t.template_id
           order by t.sequence, t.item_text
         ) as move_ordinal
    from "Reference"."GateChecklistTemplates" t
   where t.gate_code = 'G3'
     and t.item_text in (
       'Lab trial batches executed',
       'Allergen declaration validated',
       'Sensory evaluation passed',
       'Retailer specification confirmed',
       'Label copy approved by QA'
     )
),
target_max as (
  select t.org_id,
         t.template_id,
         coalesce(max(t.sequence), 0) as max_sequence
    from "Reference"."GateChecklistTemplates" t
   where t.gate_code = 'G4'
   group by t.org_id, t.template_id
)
update "Reference"."GateChecklistTemplates" t
   set gate_code = 'G4',
       sequence = coalesce(tm.max_sequence, 0) + moved.move_ordinal
  from moved
  left join target_max tm
    on tm.org_id = moved.org_id
   and tm.template_id = moved.template_id
 where t.ctid = moved.ctid;

-- Idempotency: guarded on gate_code = 'G4', so once this row has moved to G3
-- a re-run finds no source row; target sequence is computed once at move time.
with moved as (
  select t.ctid,
         t.org_id,
         t.template_id,
         row_number() over (
           partition by t.org_id, t.template_id
           order by t.sequence, t.item_text
         ) as move_ordinal
    from "Reference"."GateChecklistTemplates" t
   where t.gate_code = 'G4'
     and t.item_text = 'Initial shared BOM ready and linked to NPD project'
),
target_max as (
  select t.org_id,
         t.template_id,
         coalesce(max(t.sequence), 0) as max_sequence
    from "Reference"."GateChecklistTemplates" t
   where t.gate_code = 'G3'
   group by t.org_id, t.template_id
)
update "Reference"."GateChecklistTemplates" t
   set gate_code = 'G3',
       sequence = coalesce(tm.max_sequence, 0) + moved.move_ordinal
  from moved
  left join target_max tm
    on tm.org_id = moved.org_id
   and tm.template_id = moved.template_id
 where t.ctid = moved.ctid;

do $$
declare
  v_has_sequence boolean;
  v_has_is_checked boolean;
  v_sequence_insert_column text;
  v_sequence_insert_value text;
  v_sequence_update_set text;
  v_sequence_update_diff text;
  v_is_checked_insert_column text;
  v_is_checked_insert_value text;
  v_unchecked_predicate text;
begin
  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'gate_checklist_items'
       and column_name = 'sequence'
  ) into v_has_sequence;

  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'gate_checklist_items'
       and column_name = 'is_checked'
  ) into v_has_is_checked;

  -- The current repository schema has no public.gate_checklist_items.sequence column
  -- and no is_checked column; completed_at IS NOT NULL is the checked state here.
  -- These dynamic fragments keep the migration safe for environments that already
  -- added those columns outside this checkout.
  v_sequence_insert_column := case when v_has_sequence then ', sequence' else '' end;
  v_sequence_insert_value := case when v_has_sequence then ', t.sequence' else '' end;
  v_sequence_update_set := case when v_has_sequence then ', sequence = t.sequence' else '' end;
  v_sequence_update_diff := case when v_has_sequence then ' or ci.sequence is distinct from t.sequence' else '' end;
  v_is_checked_insert_column := case when v_has_is_checked then ', is_checked' else '' end;
  v_is_checked_insert_value := case when v_has_is_checked then ', false' else '' end;
  v_unchecked_predicate := case
    when v_has_is_checked then 'coalesce(ci.is_checked, false) = false and ci.completed_at is null'
    else 'ci.completed_at is null'
  end;

  -- Idempotency: matched by project + item_text, so every open project receives
  -- each current template item at most once; inserted rows are unchecked.
  execute
    'with template_source as (
       select distinct on (org_id, item_text)
              org_id, gate_code, category_code, item_text, required, sequence
         from "Reference"."GateChecklistTemplates"
        order by org_id,
                 item_text,
                 case when template_id = ''APEX_DEFAULT'' then 0 else 1 end,
                 sequence
     )
     insert into public.gate_checklist_items
       (org_id, project_id, gate_code, category_code, item_text, required, created_at, schema_version'
       || v_sequence_insert_column || v_is_checked_insert_column || ')
     select p.org_id, p.id, t.gate_code, t.category_code, t.item_text, t.required, now(), 1'
       || v_sequence_insert_value || v_is_checked_insert_value || '
       from public.npd_projects p
       join template_source t
         on t.org_id = p.org_id
      where lower(coalesce(p.current_gate, '''')) <> ''launched''
        and lower(coalesce(p.current_stage, '''')) <> ''launched''
        and not exists (
          select 1
            from public.gate_checklist_items ci
           where ci.org_id = p.org_id
             and ci.project_id = p.id
             and ci.item_text = t.item_text
        )';

  -- Idempotency: existing open-project rows are matched by stable item_text and
  -- overwritten with the canonical current template gate/category/required/sequence values.
  execute
    'with template_source as (
       select distinct on (org_id, item_text)
              org_id, gate_code, category_code, item_text, required, sequence
         from "Reference"."GateChecklistTemplates"
        order by org_id,
                 item_text,
                 case when template_id = ''APEX_DEFAULT'' then 0 else 1 end,
                 sequence
     )
     update public.gate_checklist_items ci
        set gate_code = t.gate_code,
            category_code = t.category_code,
            required = t.required'
            || v_sequence_update_set || '
       from public.npd_projects p
       join template_source t
         on t.org_id = p.org_id
      where ci.org_id = p.org_id
        and ci.project_id = p.id
        and ci.item_text = t.item_text
        and lower(coalesce(p.current_gate, '''')) <> ''launched''
        and lower(coalesce(p.current_stage, '''')) <> ''launched''
        and (
          ci.gate_code is distinct from t.gate_code
          or ci.category_code is distinct from t.category_code
          or ci.required is distinct from t.required'
          || v_sequence_update_diff || '
        )';

  -- Idempotency: deletes only unchecked open-project rows that are absent from
  -- the current org template set for their gate; checked/completed rows are preserved.
  execute
    'delete from public.gate_checklist_items ci
      using public.npd_projects p
      where ci.org_id = p.org_id
        and ci.project_id = p.id
        and lower(coalesce(p.current_gate, '''')) <> ''launched''
        and lower(coalesce(p.current_stage, '''')) <> ''launched''
        and ' || v_unchecked_predicate || '
        and not exists (
          select 1
            from "Reference"."GateChecklistTemplates" t
           where t.org_id = ci.org_id
             and t.gate_code = ci.gate_code
             and t.item_text = ci.item_text
        )';
end
$$;

create or replace function public.seed_gate_checklist_templates_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, "Reference"
as $$
begin
  -- Idempotency: anti-joined by org/template/item_text and protected by the
  -- primary-key ON CONFLICT clause, so re-running does not duplicate seeded rows.
  insert into "Reference"."GateChecklistTemplates"
    (org_id, template_id, gate_code, category_code, item_text, required, sequence, schema_version)
  select p_org_id,
         v.template_id,
         v.gate_code,
         v.category_code,
         v.item_text,
         v.required,
         v.sequence,
         v.schema_version
    from (
      values
      -- G0: 4
      ('APEX_DEFAULT', 'G0', 'business',   'Product concept documented',   true,  1, 1),
      ('APEX_DEFAULT', 'G0', 'business',   'Market opportunity identified', true,  2, 1),
      ('APEX_DEFAULT', 'G0', 'business',   'Preliminary cost target set',   false, 3, 1),
      ('APEX_DEFAULT', 'G0', 'technical',  'Initial feasibility check',     true,  4, 1),

      -- G1: 5
      ('APEX_DEFAULT', 'G1', 'technical',  'Technical feasibility confirmed', true,  1, 1),
      ('APEX_DEFAULT', 'G1', 'technical',  'Key ingredients identified',      true,  2, 1),
      ('APEX_DEFAULT', 'G1', 'technical',  'Initial allergen assessment',     true,  3, 1),
      ('APEX_DEFAULT', 'G1', 'business',   'Rough cost estimate',             true,  4, 1),
      ('APEX_DEFAULT', 'G1', 'business',   'Competitor benchmark review',     false, 5, 1),

      -- G2: 6 after D36/D37 remap
      ('APEX_DEFAULT', 'G2', 'technical',   'Detailed ingredient specification', true,  1, 1),
      ('APEX_DEFAULT', 'G2', 'business',    'Business case documented',          true,  2, 1),
      ('APEX_DEFAULT', 'G2', 'business',    'Resource plan approved',            true,  3, 1),
      ('APEX_DEFAULT', 'G2', 'business',    'Market research summary',           false, 4, 1),
      ('APEX_DEFAULT', 'G2', 'compliance',  'Regulatory pathway identified',     true,  5, 1),
      ('APEX_DEFAULT', 'G2', 'compliance',  'Preliminary HACCP considerations',  false, 6, 1),

      -- G3: 11 after D36/D37 remap
      ('APEX_DEFAULT', 'G3', 'technical',   'Formulation created and locked',         true,  1, 1),
      ('APEX_DEFAULT', 'G3', 'business',    'Recipe costing computed',                true,  2, 1),
      ('APEX_DEFAULT', 'G3', 'compliance',  'Nutrition declaration calculated',        true,  3, 1),
      ('APEX_DEFAULT', 'G3', 'technical',   'Shelf life assessment',                  true,  4, 1),
      ('APEX_DEFAULT', 'G3', 'technical',   'Packaging compatibility check',          false, 5, 1),
      ('APEX_DEFAULT', 'G3', 'business',    'Target cost approved',                   true,  6, 1),
      ('APEX_DEFAULT', 'G3', 'business',    'Target margin confirmed',                true,  7, 1),
      ('APEX_DEFAULT', 'G3', 'compliance',  'Initial label requirements',             false, 8, 1),
      ('APEX_DEFAULT', 'G3', 'technical',   'FG candidate created or mapped in system', true, 9, 1),
      ('APEX_DEFAULT', 'G3', 'compliance',  'No blocking risk or compliance docs outstanding', true, 10, 1),
      ('APEX_DEFAULT', 'G3', 'technical',   'Initial shared BOM ready and linked to NPD project', true, 11, 1),

      -- G4: 22 after D36/D37 remap
      ('APEX_DEFAULT', 'G4', 'technical',   'Pilot run on production line',     true,  1, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'Production yield ≥ target',        true,  2, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'CCP log verified',                 true,  3, 1),
      ('APEX_DEFAULT', 'G4', 'compliance',  'Microbiological testing passed',   true,  4, 1),
      ('APEX_DEFAULT', 'G4', 'compliance',  'Shelf-life validation complete',   true,  5, 1),
      ('APEX_DEFAULT', 'G4', 'compliance',  'Final label approved (BRCGS)',     true,  6, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Commercial order placed',          true,  7, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Dispatch readiness confirmed',     false, 8, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Done_Core: Core department NPD data closed',               true,  9,  1),
      ('APEX_DEFAULT', 'G4', 'business',    'Done_Planning: Planning department NPD data closed',        true,  10, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Done_Commercial: Commercial department NPD data closed',    true,  11, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Done_Production: Production department NPD data closed',    true,  12, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'Done_Technical: Technical department NPD data closed (Closed_Technical; does not imply factory_spec approval)', true, 13, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Done_MRP: MRP department NPD data closed',                 true,  14, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Done_Procurement: Procurement department NPD data closed',  true,  15, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'RM usability PASS: all BOM raw materials confirmed usable for this product', true, 16, 1),
      ('APEX_DEFAULT', 'G4', 'compliance',  'Initial factory_spec submitted for Technical approval (factory use requires Technical sign-off of factory_spec/BOM bundle)', true, 17, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'Lab trial batches executed',       true, 18, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'Allergen declaration validated',   true, 19, 1),
      ('APEX_DEFAULT', 'G4', 'technical',   'Sensory evaluation passed',        true, 20, 1),
      ('APEX_DEFAULT', 'G4', 'business',    'Retailer specification confirmed', true, 21, 1),
      ('APEX_DEFAULT', 'G4', 'compliance',  'Label copy approved by QA',        true, 22, 1)
    ) as v(template_id, gate_code, category_code, item_text, required, sequence, schema_version)
   where not exists (
     select 1
       from "Reference"."GateChecklistTemplates" existing
      where existing.org_id = p_org_id
        and existing.template_id = v.template_id
        and existing.item_text = v.item_text
   )
  on conflict (org_id, template_id, gate_code, sequence) do nothing;
end;
$$;

comment on function public.seed_gate_checklist_templates_for_org(uuid)
  is 'T-056/D36/D37: Seeds post-remap default G0-G4 GateChecklistTemplate rows (APEX_DEFAULT) for the given org. Idempotent by item anti-join plus ON CONFLICT DO NOTHING. Called by trg_seed_gate_checklist_templates and migration 101 backfill.';

create or replace function public.seed_gate_checklist_templates_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
      from information_schema.tables
     where table_schema = 'Reference'
       and table_name = 'GateChecklistTemplates'
  ) then
    return new;
  end if;

  perform public.seed_gate_checklist_templates_for_org(new.id);
  return new;
end;
$$;

comment on function public.seed_gate_checklist_templates_on_org_insert()
  is 'T-056/D36/D37: Trigger function seeds post-remap default G0-G4 GateChecklistTemplate rows for every new org on INSERT.';
