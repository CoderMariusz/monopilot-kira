-- Migration 495: assign shift patterns to production lines for finite scheduling.
-- Wave0: org_id business scope; existing shift_patterns RLS remains on app.current_org_id().

alter table public.shift_patterns
  add column if not exists production_line_id uuid;

do $$
declare
  v_backfilled integer;
begin
  with candidates as (
    select sp.id, (array_agg(pl.id order by pl.id))[1] as production_line_id
      from public.shift_patterns sp
      join public.production_lines pl
        on pl.org_id = sp.org_id
       and (pl.id::text = sp.line_id or pl.code = sp.line_id)
       and (sp.site_id is null or pl.site_id = sp.site_id)
     where sp.production_line_id is null
       and sp.line_id is not null
     group by sp.id
    having count(*) = 1
  )
  update public.shift_patterns sp
     set production_line_id = candidates.production_line_id
    from candidates
   where sp.id = candidates.id
     and sp.production_line_id is null;

  get diagnostics v_backfilled = row_count;
  raise notice '495-line-shift-calendar: backfilled % shift pattern line assignments', v_backfilled;
end
$$;

create index if not exists shift_patterns_org_production_line_idx
  on public.shift_patterns (org_id, production_line_id)
  where production_line_id is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.shift_patterns'::regclass
       and conname = 'shift_patterns_production_line_org_fk'
  ) then
    alter table public.shift_patterns
      add constraint shift_patterns_production_line_org_fk
      foreign key (production_line_id, org_id)
      references public.production_lines (id, org_id)
      on delete set null (production_line_id);
  end if;
end
$$;

alter table public.shift_patterns enable row level security;
alter table public.shift_patterns force row level security;

comment on column public.shift_patterns.production_line_id is
  'Optional org-safe production line assignment. NULL preserves always-available scheduler behaviour.';
