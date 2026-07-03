-- Migration 424: component-level substitutes for NPD formulation lines and shared BOM lines.
--
-- Additive/idempotent. Substitutes are declared per component line, carried into
-- the production BOM, and applied at consumption only. Existing RLS policies on
-- formulation_ingredients and bom_lines remain the org-safety boundary.

alter table public.formulation_ingredients
  add column if not exists substitute_item_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'formulation_ingredients_substitute_item_id_fkey'
       and conrelid = 'public.formulation_ingredients'::regclass
  ) then
    alter table public.formulation_ingredients
      add constraint formulation_ingredients_substitute_item_id_fkey
      foreign key (substitute_item_id)
      references public.items(id)
      on delete set null;
  end if;
end $$;

create index if not exists formulation_ingredients_substitute_item_id_idx
  on public.formulation_ingredients (substitute_item_id)
  where substitute_item_id is not null;

comment on column public.formulation_ingredients.substitute_item_id
  is 'F6-D17: optional component-level substitute item allowed for this recipe line at consumption only; allergen compatibility is enforced by the save action.';

alter table public.bom_lines
  add column if not exists substitute_item_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'bom_lines_substitute_item_id_fkey'
       and conrelid = 'public.bom_lines'::regclass
  ) then
    alter table public.bom_lines
      add constraint bom_lines_substitute_item_id_fkey
      foreign key (substitute_item_id)
      references public.items(id)
      on delete restrict;
  end if;
end $$;

create index if not exists bom_lines_org_substitute_item_idx
  on public.bom_lines (org_id, substitute_item_id)
  where substitute_item_id is not null;

comment on column public.bom_lines.substitute_item_id
  is 'F6-D17: optional component-level substitute item copied from NPD formulation lines; consumed against the same WO material requirement as the primary item.';
