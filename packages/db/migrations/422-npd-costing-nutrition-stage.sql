-- Migration 422 — new pipeline stage 'costing_nutrition' (D5: merged Costing+Nutrition
-- dot between packaging and trial). Extends the npd_projects.current_stage CHECK.

alter table public.npd_projects
  drop constraint if exists npd_projects_current_stage_check;

alter table public.npd_projects
  add constraint npd_projects_current_stage_check
  check (current_stage = any (array[
    'brief'::text, 'recipe'::text, 'packaging'::text, 'costing_nutrition'::text,
    'trial'::text, 'sensory'::text, 'pilot'::text, 'approval'::text,
    'handoff'::text, 'launched'::text
  ]));
