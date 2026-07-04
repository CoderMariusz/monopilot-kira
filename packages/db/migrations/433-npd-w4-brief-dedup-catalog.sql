-- Migration 433 — W4-B NPD owner findings: brief dedup + runs estimate + ingredient_codes auto.
--
--   #1 — retire duplicate expected_volume from brief-stage catalog (weekly_volume_packs is canonical).
--   #2 — runs_per_week label/help copy marks it as a planning estimate (editable through project life).
--   #4 — ingredient_codes is auto-derived from the recipe (read-only; hidden from stage dept editors).
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id(). Fully re-entrant.

-- ── 1. Hide legacy expected_volume from brief-stage editors ───────────────────
update public.npd_department_field df
   set visible = false,
       required = false
  from public.npd_field_catalog f,
       public.npd_departments d
 where df.field_id = f.id
   and df.org_id = f.org_id
   and d.id = df.department_id
   and d.org_id = df.org_id
   and lower(f.code) = 'expected_volume'
   and d.code = 'Core'
   and d.stage_code = 'brief';

update public.npd_field_catalog
   set active = false,
       help_text = coalesce(help_text, 'Legacy free-text volume — superseded by weekly_volume_packs (W4-B).')
 where lower(code) = 'expected_volume';

-- ── 2. Runs per week — estimate copy (D30) ────────────────────────────────────
update public.npd_field_catalog
   set label = 'Runs per week (estimate)',
       help_text = 'Planning estimate for costing setup amortisation (D30). Revise on the project brief until launch; final run rate is confirmed at handover.'
 where lower(code) = 'runs_per_week';

-- ── 2b. Hide the LEGACY Runs_Per_Week duplicate (same class as expected_volume) ─
update public.npd_department_field df
   set visible = false,
       required = false
  from public.npd_field_catalog f
 where df.field_id = f.id
   and df.org_id = f.org_id
   and f.code = 'Runs_Per_Week';

update public.npd_field_catalog
   set active = false,
       help_text = 'Legacy duplicate — superseded by runs_per_week (W4-B).'
 where code = 'Runs_Per_Week';

-- ── 3. Ingredient codes — auto-derived, not user-editable ─────────────────────
-- Catalog codes are the product-view CamelCase keys (mig 425); the auto-cycle
-- trigger validates auto_source_field against the EXACT code of an active field.
update public.npd_field_catalog c
   set is_auto = true,
       auto_source_field = 'Recipe_Components',
       label = 'Ingredient codes (auto)',
       help_text = 'Derived automatically from the locked recipe ingredients. Edit the recipe, not this field.',
       data_type = case when c.data_type = 'dropdown' then 'text' else c.data_type end
 where lower(c.code) = 'ingredient_codes'
   and c.active = true
   and exists (
     select 1 from public.npd_field_catalog s
      where s.org_id = c.org_id and s.code = 'Recipe_Components' and s.active = true
   );

-- Hide from stage-department inline editors (FA Core tab still shows read-only green field).
update public.npd_department_field df
   set visible = false,
       required = false
  from public.npd_field_catalog f
 where df.field_id = f.id
   and df.org_id = f.org_id
   and lower(f.code) = 'ingredient_codes';

-- ── 4. New-org seed hook — brief unit fields + catalog auto flags ─────────────
create or replace function public.seed_npd_brief_unit_fields(p_org uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  insert into public.npd_field_catalog
    (org_id, code, label, data_type, validation_json, help_text, active)
  values
    (p_org, 'weekly_volume_packs', 'Weekly volume (packs/week)', 'number',
     '{"minimum":0}'::jsonb,
     'Numeric weekly output in packs for costing setup amortisation (D25).', true),
    (p_org, 'runs_per_week', 'Runs per week (estimate)', 'number',
     '{"minimum":0}'::jsonb,
     'Planning estimate for costing setup amortisation (D30). Revise on the project brief until launch.', true)
  on conflict (org_id, code) do update
    set label = excluded.label,
        data_type = excluded.data_type,
        validation_json = excluded.validation_json,
        help_text = excluded.help_text,
        active = true;

  -- Legacy expected_volume: keep row for migrations/backfill but hide from editors.
  insert into public.npd_field_catalog
    (org_id, code, label, data_type, validation_json, help_text, active)
  values
    (p_org, 'expected_volume', 'Expected volume', 'text', null,
     'Legacy free-text volume — superseded by weekly_volume_packs (W4-B).', false)
  on conflict (org_id, code) do update
    set active = false,
        help_text = excluded.help_text;

  -- Auto-derived ingredient codes (W4-B #4): flip the EXISTING mapped-catalog row
  -- (code 'Ingredient_Codes', seeded by the dynamic catalog seed) — never insert
  -- a duplicate lowercase row. Guarded: only when Recipe_Components exists active
  -- in this org (auto-cycle trigger validates the exact source code).
  update public.npd_field_catalog c
     set is_auto = true,
         auto_source_field = 'Recipe_Components',
         label = 'Ingredient codes (auto)',
         help_text = 'Derived automatically from the locked recipe ingredients.'
   where c.org_id = p_org
     and lower(c.code) = 'ingredient_codes'
     and c.active = true
     and exists (
       select 1 from public.npd_field_catalog s
        where s.org_id = p_org and s.code = 'Recipe_Components' and s.active = true
     );

  -- Legacy Runs_Per_Week duplicate — deactivate for new orgs too.
  update public.npd_field_catalog
     set active = false,
         help_text = 'Legacy duplicate — superseded by runs_per_week (W4-B).'
   where org_id = p_org
     and code = 'Runs_Per_Week';

  insert into public.npd_department_field
    (org_id, department_id, field_id, required, visible, display_order)
  select d.org_id, d.id, f.id, true, true, v.display_order
    from public.npd_departments d
    join public.npd_field_catalog f on f.org_id = d.org_id
   cross join (
     values
       ('weekly_volume_packs'::text, 78::integer),
       ('runs_per_week', 79)
   ) as v(code, display_order)
   where d.org_id = p_org
     and d.code = 'Core'
     and d.stage_code = 'brief'
     and f.code = v.code
  on conflict (org_id, department_id, field_id) do update
    set required = excluded.required,
        visible = excluded.visible,
        display_order = excluded.display_order;

  -- Hide legacy + auto fields from brief/core stage inline editors.
  update public.npd_department_field df
     set visible = false,
         required = false
    from public.npd_field_catalog f,
         public.npd_departments d
   where df.field_id = f.id
     and df.org_id = f.org_id
     and df.department_id = d.id
     and df.org_id = d.org_id
     and d.org_id = p_org
     and lower(f.code) in ('expected_volume', 'ingredient_codes');
end;
$fn$;
