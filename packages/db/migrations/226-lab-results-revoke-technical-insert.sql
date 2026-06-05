-- Migration 226: 03-Technical corrective grant narrowing for Quality-owned lab_results.
-- TEC-G-04: migration 162 granted INSERT to app_user in a Technical context so a
-- Quality-side bridge could author rows. Canonical writes belong to 09-quality; Technical
-- must remain read-only for public.lab_results.

revoke insert, update, delete on public.lab_results from app_user;
grant select on public.lab_results to app_user;

comment on table public.lab_results is
  'Quality-owned read model. Technical context is read-only; app_user keeps SELECT only here, with writes owned by 09-quality.';
