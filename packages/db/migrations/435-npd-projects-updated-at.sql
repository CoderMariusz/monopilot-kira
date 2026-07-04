-- Migration 435 — npd_projects.updated_at (W4 walk-#2 root cause).
--
-- Several server actions (save-costing-inputs, pilot auto-BOM path, brief
-- write-through) issue `UPDATE public.npd_projects SET updated_at = now()`,
-- but the table only ever had created_at — every such write threw 42703 and
-- rolled the whole transaction back (costing inputs never persisted; the
-- pilot WO + BOM materialization failed). Standard column + touch trigger
-- (house pattern: public.touch_updated_at(), mig 016). Fully re-entrant.

alter table public.npd_projects
  add column if not exists updated_at timestamptz not null default now();

-- Keep the canonical mig-016 body byte-compatible (SECURITY DEFINER, pinned path).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists npd_projects_touch_updated_at on public.npd_projects;
create trigger npd_projects_touch_updated_at
  before update on public.npd_projects
  for each row
  execute function public.touch_updated_at();
