-- W5 L1: routing origin marker.

alter table public.routings
  add column if not exists origin_module text not null default 'technical';

update public.routings
   set origin_module = 'technical'
 where origin_module is null;

alter table public.routings
  alter column origin_module set default 'technical',
  alter column origin_module set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'routings_origin_module_check'
       and conrelid = 'public.routings'::regclass
  ) then
    alter table public.routings
      add constraint routings_origin_module_check
      check (origin_module in ('technical', 'npd'));
  end if;
end $$;
