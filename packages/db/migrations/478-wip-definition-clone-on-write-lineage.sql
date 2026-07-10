-- Migration 478 — WIP definition clone-on-write lineage (Wave 15 / N-22).
--
-- Adds supersedes_wip_definition_id for version chains and narrows the name
-- uniqueness guard to one active row per org+name so in-flight draft successors
-- can coexist with the immutable active predecessor.

alter table public.wip_definitions
  add column if not exists supersedes_wip_definition_id uuid;

alter table public.wip_definitions
  drop constraint if exists wip_definitions_supersedes_fk;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'wip_definitions_supersedes_fk'
       and conrelid = 'public.wip_definitions'::regclass
  ) then
    alter table public.wip_definitions
      add constraint wip_definitions_supersedes_fk
      foreign key (supersedes_wip_definition_id, org_id)
      references public.wip_definitions (id, org_id)
      on delete set null;
  end if;
end $$;

drop index if exists public.wip_definitions_org_lower_name_active_uq;

create unique index if not exists wip_definitions_org_lower_name_active_uq
  on public.wip_definitions (org_id, lower(name))
  where status = 'active';

comment on column public.wip_definitions.supersedes_wip_definition_id is
  'Clone-on-write lineage: the prior immutable WIP definition version this row supersedes.';
