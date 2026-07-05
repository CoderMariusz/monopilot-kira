-- W5 L1: packaging substitute item reference.

alter table public.packaging_components
  add column if not exists substitute_item_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'packaging_components_substitute_item_id_fkey'
       and conrelid = 'public.packaging_components'::regclass
  ) then
    alter table public.packaging_components
      add constraint packaging_components_substitute_item_id_fkey
      foreign key (substitute_item_id)
      references public.items (id)
      on delete restrict;
  end if;
end $$;
