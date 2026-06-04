-- Migration 157: NPD Lane-B — wire components to the items master (real items, not free text).
-- PRD: docs/prd/01-NPD-PRD.md §4.3 (prod_detail) + §17.11.1 (formulation) + 03-Technical §5.1 (items).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- A "component" (production detail row) and a formulation ingredient must reference a
-- REAL item from public.items (item_type rm/intermediate/co_product), not a free-text code.
-- This migration:
--   1. adds a nullable item_id uuid -> public.items(id) on public.prod_detail
--      (keeping intermediate_code as the display code), org-consistent FK.
--   2. adds a nullable item_id uuid -> public.items(id) on public.formulation_ingredients
--      (keeping rm_code as the display code).
--   3. provides public.sync_prod_detail_rows(p_product_code, p_app_version) — a
--      SECURITY DEFINER function that materializes/refreshes prod_detail rows from the
--      product's recipe_components free-text list, org-scoped to app.current_org_id(),
--      so editing the Core recipe actually produces Production rows. Idempotent.
--
-- Test env (DB wiped before real orgs) — no backfill of legacy free-text codes needed.

-- ---------------------------------------------------------------------------
-- 1. prod_detail.item_id  (nullable FK -> items)
-- ---------------------------------------------------------------------------
alter table public.prod_detail
  add column if not exists item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prod_detail_item_id_fkey'
  ) then
    alter table public.prod_detail
      add constraint prod_detail_item_id_fkey
      foreign key (item_id) references public.items(id) on delete set null;
  end if;
end
$$;

create index if not exists prod_detail_item_id_idx
  on public.prod_detail (item_id)
  where item_id is not null;

-- ---------------------------------------------------------------------------
-- 2. formulation_ingredients.item_id  (nullable FK -> items)
-- ---------------------------------------------------------------------------
alter table public.formulation_ingredients
  add column if not exists item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'formulation_ingredients_item_id_fkey'
  ) then
    alter table public.formulation_ingredients
      add constraint formulation_ingredients_item_id_fkey
      foreign key (item_id) references public.items(id) on delete set null;
  end if;
end
$$;

create index if not exists formulation_ingredients_item_id_idx
  on public.formulation_ingredients (item_id)
  where item_id is not null;

-- ---------------------------------------------------------------------------
-- 3. sync_prod_detail_rows(product_code, app_version)
--    Materialize/refresh prod_detail rows from product.recipe_components.
--    Org-scoped to app.current_org_id() (SECURITY DEFINER runs as owner, so we
--    pin the org explicitly and never trust ambient state). Idempotent: a second
--    call with the same recipe_components is a no-op (no spurious row churn).
-- ---------------------------------------------------------------------------
create or replace function public.sync_prod_detail_rows(
  p_product_code text,
  p_app_version text default 'sync_prod_detail_rows-v1'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_recipe text;
  v_components text[];
  v_added text[] := '{}'::text[];
  v_removed text[] := '{}'::text[];
  v_code text;
  v_idx integer := 0;
  v_item_id uuid;
  v_changed integer := 0;
begin
  if v_org_id is null then
    raise exception 'sync_prod_detail_rows requires an org context (app.current_org_id() is null)';
  end if;

  -- Read the product's free-text recipe component list (comma-separated) within scope.
  select p.recipe_components
    into v_recipe
    from public.product p
   where p.org_id = v_org_id
     and p.product_code = p_product_code;

  if not found then
    raise exception 'sync_prod_detail_rows: product % not visible in org %', p_product_code, v_org_id;
  end if;

  -- Parse: split on comma, trim, drop blanks, de-duplicate preserving first-seen order.
  select coalesce(
           array_agg(c order by ord),
           '{}'::text[]
         )
    into v_components
    from (
      select trimmed as c, min(ord) as ord
        from (
          select pg_catalog.btrim(part) as trimmed,
                 ordinality as ord
            from unnest(string_to_array(coalesce(v_recipe, ''), ',')) with ordinality as t(part, ordinality)
        ) parts
       where length(trimmed) > 0
       group by trimmed
    ) deduped;

  -- Remove prod_detail rows whose intermediate_code no longer appears in the recipe.
  with deleted as (
    delete from public.prod_detail pd
     where pd.org_id = v_org_id
       and pd.product_code = p_product_code
       and not (pd.intermediate_code = any (v_components))
    returning pd.intermediate_code
  )
  select coalesce(array_agg(intermediate_code), '{}'::text[]) into v_removed from deleted;
  v_changed := v_changed + coalesce(array_length(v_removed, 1), 0);

  -- Upsert one row per component, in recipe order. Match an existing real item
  -- by code so item_id is wired automatically when the item master has it.
  foreach v_code in array v_components loop
    v_idx := v_idx + 1;

    select i.id
      into v_item_id
      from public.items i
     where i.org_id = v_org_id
       and i.item_code = v_code
       and i.item_type in ('rm', 'intermediate', 'co_product')
     limit 1;

    if exists (
      select 1 from public.prod_detail pd
       where pd.org_id = v_org_id
         and pd.product_code = p_product_code
         and pd.intermediate_code = v_code
    ) then
      update public.prod_detail pd
         set component_index = v_idx,
             item_id = coalesce(v_item_id, pd.item_id)
       where pd.org_id = v_org_id
         and pd.product_code = p_product_code
         and pd.intermediate_code = v_code
         and (pd.component_index is distinct from v_idx
              or (v_item_id is not null and pd.item_id is distinct from v_item_id));
    else
      insert into public.prod_detail
        (org_id, product_code, intermediate_code, component_index, item_id)
      values
        (v_org_id, p_product_code, v_code, v_idx, v_item_id);
      v_added := array_append(v_added, v_code);
      v_changed := v_changed + 1;
    end if;
  end loop;

  -- Emit an audit event only when the materialized component set actually changed.
  if coalesce(array_length(v_added, 1), 0) > 0
     or coalesce(array_length(v_removed, 1), 0) > 0 then
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (v_org_id, 'fa.recipe_changed', 'fa', p_product_code,
       jsonb_build_object(
         'product_code', p_product_code,
         'next_recipe_components', array_to_string(v_components, ', '),
         'diff', jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed))
       ),
       p_app_version);
  end if;

  return v_changed;
end;
$$;

-- app_user invokes the sync after editing recipe_components (via the FA cell action).
revoke all on function public.sync_prod_detail_rows(text, text) from public;
grant execute on function public.sync_prod_detail_rows(text, text) to app_user;

comment on function public.sync_prod_detail_rows(text, text)
  is 'Lane-B: materialize/refresh prod_detail rows from product.recipe_components (org-scoped, idempotent); wires item_id from the items master by code.';

comment on column public.prod_detail.item_id
  is 'Lane-B: optional FK to the real items master row this component represents (intermediate_code stays the display code).';
comment on column public.formulation_ingredients.item_id
  is 'Lane-B: optional FK to the real items master row this ingredient represents (rm_code stays the display code).';
