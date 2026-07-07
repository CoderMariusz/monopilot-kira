-- Migration 448 — explicit NPD brief output unit (R3.2).
-- Nullable for backward compatibility: existing rows keep runtime inference until set.

alter table public.npd_projects add column if not exists output_unit text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_output_unit_check'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_output_unit_check
      check (output_unit is null or output_unit in ('kg', 'pieces', 'boxes'));
  end if;
end $$;
