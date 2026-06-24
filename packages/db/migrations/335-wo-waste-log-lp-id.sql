alter table public.wo_waste_log
  add column if not exists lp_id uuid references public.license_plates(id) on delete set null;

create index if not exists idx_wo_waste_log_lp_id
  on public.wo_waste_log(lp_id)
  where lp_id is not null;
