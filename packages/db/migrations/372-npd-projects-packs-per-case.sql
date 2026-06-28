-- Migration 372 — packs_per_case brief field: add it to npd_projects (owner decision 4).
-- 'Packs per case' becomes a project brief field; the FG pre-fills it on creation (kill double-entry),
-- mirroring A12 (weight/price_brief/volume). The FG target column fg_npd_ext.packs_per_case ALREADY exists
-- (mig 353) and flows through the public.product view (mig 359, INSTEAD-OF triggers) — only the
-- npd_projects brief SOURCE was missing (mig 368 explicitly noted this). Whole packs => integer,
-- non-negative. No backfill: the column is new (all NULL), so there is nothing to copy into fg_npd_ext
-- yet; the runtime gate-helpers copy-on-create handles new/created FGs going forward. Idempotent.

alter table public.npd_projects add column if not exists packs_per_case integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_packs_per_case_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_packs_per_case_nonneg
      check (packs_per_case is null or packs_per_case >= 0);
  end if;
end $$;
