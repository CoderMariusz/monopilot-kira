-- Migration 242: Merge Brief INTO the NPD project + expand the operational stage enum
--
-- Product pivot (2026-06-06): the standalone Brief flow is folded into the project
-- create-wizard (project.jsx:107-263 — Basics / Brief / Starting point / Review). The
-- brief's capture fields now live directly on public.npd_projects, so a project IS its
-- brief from creation. The legacy public.brief / public.brief_lines tables are left in
-- place for now (a later cleanup migration drops them once GDPR/audit/V08/field-mapping
-- references are migrated) — this migration only ADDS the project columns + widens the
-- stage CHECK so the 8-stage operational pipeline can be persisted.
--
-- Stage pipeline (8 + terminal): brief → recipe → packaging → trial → sensory → pilot
-- → approval → handoff → (launched). The per-stage tables already exist (migrations
-- 232-237); only the npd_projects.current_stage CHECK was still limited to the original
-- 5 (brief/recipe/trial/approval/handoff) from migration 085.
--
-- Wave0 lock: org_id business scope; RLS unchanged (column adds only). Idempotent.

-- ============================================================
-- 1. Brief capture fields → public.npd_projects (all nullable; the wizard's Brief
--    step is optional except name+category which already exist as name + type).
--    `type` IS the category field (no separate category column — confirmed).
-- ============================================================
ALTER TABLE public.npd_projects
  ADD COLUMN IF NOT EXISTS target_retail_price_eur numeric(12,2),
  ADD COLUMN IF NOT EXISTS pack_format             text,
  ADD COLUMN IF NOT EXISTS sales_channel           text,
  ADD COLUMN IF NOT EXISTS expected_volume         text,
  ADD COLUMN IF NOT EXISTS target_audience         text,
  ADD COLUMN IF NOT EXISTS marketing_claims        text,
  ADD COLUMN IF NOT EXISTS constraints             text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'npd_projects_target_price_nonneg') THEN
    ALTER TABLE public.npd_projects ADD CONSTRAINT npd_projects_target_price_nonneg
      CHECK (target_retail_price_eur IS NULL OR target_retail_price_eur >= 0);
  END IF;
END
$$;

-- ============================================================
-- 2. Widen the current_stage CHECK from the original 5 to the full 8-stage
--    operational pipeline + terminal 'launched'. Drop-then-add (the old constraint
--    name is preserved from migration 085).
-- ============================================================
ALTER TABLE public.npd_projects
  DROP CONSTRAINT IF EXISTS npd_projects_current_stage_check;

ALTER TABLE public.npd_projects
  ADD CONSTRAINT npd_projects_current_stage_check
  CHECK (current_stage IN (
    'brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff', 'launched'
  ));
