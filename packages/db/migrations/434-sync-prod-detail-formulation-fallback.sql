-- Migration 434: extend prod_detail sync fallback to current formulation rows.
--
-- Existing behavior is preserved: when product.recipe_components contains Core
-- free-text rows, sync_prod_detail_rows materializes prod_detail from that list.
-- When Core text is empty/null, this version falls back to the project's current
-- formulation_ingredients item-linked rows and uses their rm_code values.

create or replace function public.sync_prod_detail_rows(
  p_product_code text,
  p_app_version text default 'sync_prod_detail_rows-v1'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
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

  select p.recipe_components
    into v_recipe
    from public.product p
   where p.org_id = v_org_id
     and p.product_code = p_product_code;

  if not found then
    raise exception 'sync_prod_detail_rows: product % not visible in org %', p_product_code, v_org_id;
  end if;

  if length(pg_catalog.btrim(coalesce(v_recipe, ''))) > 0 then
    select coalesce(array_agg(c order by ord), '{}'::text[])
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
  else
    select coalesce(array_agg(rm_code order by first_sequence), '{}'::text[])
      into v_components
      from (
        select fi.rm_code, min(fi.sequence) as first_sequence
          from public.formulations f
          join public.formulation_versions fv
            on fv.id = f.current_version_id
           and fv.formulation_id = f.id
          join public.formulation_ingredients fi
            on fi.version_id = fv.id
           and fi.item_id is not null
         where f.org_id = v_org_id
           and f.product_code = p_product_code
           and length(pg_catalog.btrim(fi.rm_code)) > 0
         group by fi.rm_code
      ) linked_formulation_rows;
  end if;

  with deleted as (
    delete from public.prod_detail pd
     where pd.org_id = v_org_id
       and pd.product_code = p_product_code
       and not (pd.intermediate_code = any (v_components))
    returning pd.intermediate_code
  )
  select coalesce(array_agg(intermediate_code), '{}'::text[]) into v_removed from deleted;
  v_changed := v_changed + coalesce(array_length(v_removed, 1), 0);

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

revoke all on function public.sync_prod_detail_rows(text, text) from public;
grant execute on function public.sync_prod_detail_rows(text, text) to app_user;

comment on function public.sync_prod_detail_rows(text, text)
  is 'Lane-B/W4-C: materialize/refresh prod_detail rows from product.recipe_components, falling back to current item-linked formulation ingredient rm_code rows when Core text is empty; org-scoped and idempotent.';
