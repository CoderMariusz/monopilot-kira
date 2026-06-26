-- 346: explicit human acceptance of the FG allergen declaration (NPD approval C5).
-- Today the C5 'audited' condition only becomes true when an async
-- public.allergen_cascade_rebuild_jobs row reaches status='processed' — there is
-- NO user-facing way to accept the declaration, so users get stuck at approval
-- (Submit stays disabled while C5 is 'pending'). Add an explicit acceptance flag
-- (+ who/when for the 21 CFR-style audit trail). The approval evaluator
-- (packages/domain/src/approval/evaluate.ts) treats accepted=true as satisfying
-- the C5 'audited' condition. Additive + idempotent; product already carries org
-- RLS + app_user grants so the new columns inherit them.
alter table public.product
  add column if not exists allergens_declaration_accepted boolean not null default false,
  add column if not exists allergens_declaration_accepted_by uuid,
  add column if not exists allergens_declaration_accepted_at timestamptz;
