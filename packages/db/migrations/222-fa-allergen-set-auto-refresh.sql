-- P0-1: keep public.product.allergens / may_contain materialized in the same
-- transaction as every source edit that can affect public.fa_allergen_cascade.
-- Sources mirrored from migrations 075, 076, 082, 094, 114, 141, 157 and 161.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create or replace function public.fa_refresh_allergen_set_for_product_fn()
returns trigger
language plpgsql
security invoker
as $$
begin
  if app.current_org_id() is null then
    raise exception 'fa allergen auto-refresh requires an org context (app.current_org_id())';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  perform public.update_fa_allergen_set(new.product_code);
  return new;
end;
$$;

revoke all on function public.fa_refresh_allergen_set_for_product_fn() from public;

drop trigger if exists fa_allergen_set_refresh_on_product_insert on public.product;
create trigger fa_allergen_set_refresh_on_product_insert
  after insert on public.product
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_product_fn();

drop trigger if exists fa_allergen_set_refresh_on_product_edit on public.product;
create trigger fa_allergen_set_refresh_on_product_edit
  after update of recipe_components, ingredient_codes on public.product
  for each row
  when (
    pg_trigger_depth() < 2
    and (
      old.recipe_components is distinct from new.recipe_components
      or old.ingredient_codes is distinct from new.ingredient_codes
    )
  )
  execute function public.fa_refresh_allergen_set_for_product_fn();

create or replace function public.fa_refresh_allergen_set_for_prod_detail_fn()
returns trigger
language plpgsql
security invoker
as $$
begin
  if app.current_org_id() is null then
    raise exception 'fa prod_detail allergen auto-refresh requires an org context (app.current_org_id())';
  end if;

  if tg_op = 'INSERT' then
    perform public.update_fa_allergen_set(new.product_code);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.update_fa_allergen_set(old.product_code);
    return old;
  end if;

  if old.product_code is distinct from new.product_code then
    perform public.update_fa_allergen_set(old.product_code);
    perform public.update_fa_allergen_set(new.product_code);
  else
    perform public.update_fa_allergen_set(new.product_code);
  end if;

  return new;
end;
$$;

revoke all on function public.fa_refresh_allergen_set_for_prod_detail_fn() from public;

drop trigger if exists fa_allergen_set_refresh_on_prod_detail_insert on public.prod_detail;
create trigger fa_allergen_set_refresh_on_prod_detail_insert
  after insert on public.prod_detail
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_prod_detail_fn();

drop trigger if exists fa_allergen_set_refresh_on_prod_detail_edit on public.prod_detail;
create trigger fa_allergen_set_refresh_on_prod_detail_edit
  after update of org_id, product_code, manufacturing_operation_1, manufacturing_operation_2,
    manufacturing_operation_3, manufacturing_operation_4 on public.prod_detail
  for each row
  when (
    pg_trigger_depth() < 2
    and (
      old.product_code is distinct from new.product_code
      or old.org_id is distinct from new.org_id
      or old.manufacturing_operation_1 is distinct from new.manufacturing_operation_1
      or old.manufacturing_operation_2 is distinct from new.manufacturing_operation_2
      or old.manufacturing_operation_3 is distinct from new.manufacturing_operation_3
      or old.manufacturing_operation_4 is distinct from new.manufacturing_operation_4
    )
  )
  execute function public.fa_refresh_allergen_set_for_prod_detail_fn();

drop trigger if exists fa_allergen_set_refresh_on_prod_detail_delete on public.prod_detail;
create trigger fa_allergen_set_refresh_on_prod_detail_delete
  after delete on public.prod_detail
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_prod_detail_fn();

create or replace function public.fa_refresh_allergen_set_for_rm_reference_fn()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_old_org_id uuid;
  v_old_ingredient_codes text;
  v_new_org_id uuid;
  v_new_ingredient_codes text;
  v_product_code text;
begin
  if v_org_id is null then
    raise exception 'fa RM allergen auto-refresh requires an org context (app.current_org_id())';
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_org_id := old.org_id;
    v_old_ingredient_codes := old.ingredient_codes;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_org_id := new.org_id;
    v_new_ingredient_codes := new.ingredient_codes;
  end if;

  for v_product_code in
    select distinct p.product_code
      from public.product p
      cross join lateral pg_catalog.regexp_split_to_table(
        coalesce(p.ingredient_codes, ''), '\s*,\s*'
      ) as parsed(ingredient_code)
     where p.org_id = v_org_id
       and pg_catalog.btrim(parsed.ingredient_code) <> ''
       and (
         (v_old_org_id = v_org_id and v_old_ingredient_codes = pg_catalog.btrim(parsed.ingredient_code))
         or
         (v_new_org_id = v_org_id and v_new_ingredient_codes = pg_catalog.btrim(parsed.ingredient_code))
       )
  loop
    perform public.update_fa_allergen_set(v_product_code);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.fa_refresh_allergen_set_for_rm_reference_fn() from public;

drop trigger if exists fa_allergen_set_refresh_on_rm_reference_edit on "Reference"."Allergens_by_RM";
create trigger fa_allergen_set_refresh_on_rm_reference_edit
  after insert or update of org_id, ingredient_codes, allergen_code, confidence or delete
  on "Reference"."Allergens_by_RM"
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_rm_reference_fn();

create or replace function public.fa_refresh_allergen_set_for_process_reference_fn()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_old_org_id uuid;
  v_old_process_name text;
  v_new_org_id uuid;
  v_new_process_name text;
  v_product_code text;
begin
  if v_org_id is null then
    raise exception 'fa process allergen auto-refresh requires an org context (app.current_org_id())';
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_org_id := old.org_id;
    v_old_process_name := old.process_name;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_org_id := new.org_id;
    v_new_process_name := new.process_name;
  end if;

  for v_product_code in
    select distinct pd.product_code
      from public.prod_detail pd
      cross join lateral (
        values
          (pd.manufacturing_operation_1),
          (pd.manufacturing_operation_2),
          (pd.manufacturing_operation_3),
          (pd.manufacturing_operation_4)
      ) as ops(process_name)
     where pd.org_id = v_org_id
       and ops.process_name is not null
       and (
         (v_old_org_id = v_org_id and v_old_process_name = ops.process_name)
         or
         (v_new_org_id = v_org_id and v_new_process_name = ops.process_name)
       )
  loop
    perform public.update_fa_allergen_set(v_product_code);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.fa_refresh_allergen_set_for_process_reference_fn() from public;

drop trigger if exists fa_allergen_set_refresh_on_process_reference_edit
  on "Reference"."Allergens_added_by_Process";
create trigger fa_allergen_set_refresh_on_process_reference_edit
  after insert or update of org_id, process_name, allergen_code, confidence, recipe_condition or delete
  on "Reference"."Allergens_added_by_Process"
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_process_reference_fn();

create or replace function public.fa_refresh_allergen_set_for_override_fn()
returns trigger
language plpgsql
security invoker
as $$
begin
  if app.current_org_id() is null then
    raise exception 'fa override allergen auto-refresh requires an org context (app.current_org_id())';
  end if;

  perform public.update_fa_allergen_set(new.product_code);
  return new;
end;
$$;

revoke all on function public.fa_refresh_allergen_set_for_override_fn() from public;

drop trigger if exists fa_allergen_set_refresh_on_override_insert on public.fa_allergen_overrides;
create trigger fa_allergen_set_refresh_on_override_insert
  after insert on public.fa_allergen_overrides
  for each row
  when (pg_trigger_depth() < 2)
  execute function public.fa_refresh_allergen_set_for_override_fn();

comment on function public.fa_refresh_allergen_set_for_product_fn() is
  'P0-1: after product.recipe_components / ingredient_codes changes, refresh public.update_fa_allergen_set(product_code) in the same transaction.';
comment on function public.fa_refresh_allergen_set_for_prod_detail_fn() is
  'P0-1: after prod_detail manufacturing operation changes, refresh public.update_fa_allergen_set(product_code) in the same transaction.';
comment on function public.fa_refresh_allergen_set_for_rm_reference_fn() is
  'P0-1: after Reference.Allergens_by_RM changes, refresh every visible product whose ingredient_codes reference the changed RM code.';
comment on function public.fa_refresh_allergen_set_for_process_reference_fn() is
  'P0-1: after Reference.Allergens_added_by_Process changes, refresh every visible product whose prod_detail operations reference the changed process.';
comment on function public.fa_refresh_allergen_set_for_override_fn() is
  'P0-1: after fa_allergen_overrides insert, refresh public.update_fa_allergen_set(product_code) in the same transaction.';
