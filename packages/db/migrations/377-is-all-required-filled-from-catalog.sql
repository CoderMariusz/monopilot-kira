-- Migration 377 — A3 slice-4: the dept-close gate reads the dynamic catalog (not Reference.DeptColumns).
-- is_all_required_filled(product_code, dept) is the dept-CLOSE gate: it returns true only when every
-- required field of a dept has a non-empty value on public.product. It read the required-field list from
-- "Reference"."DeptColumns".required_for_done; switch that source to npd_department_field.required (joined
-- via npd_field_catalog) so Settings NPD field-config (df.required) is authoritative for the CLOSE gate too —
-- completing the slice-3 render swap on the gate side (kills the read-side DeptColumns split-brain).
-- BEHAVIOUR-PRESERVING: verified live that the required-field set per dept is IDENTICAL between
-- DeptColumns.required_for_done and npd_department_field.required (29 = 29, zero diff in either direction).
-- ONLY the required-column SOURCE query changes; the product-row load + per-field non-empty value check are byte-identical.

create or replace function public.is_all_required_filled(product_code text, dept text)
 returns boolean
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'public', 'Reference'
as $function$
declare
  product_row public.product%rowtype;
  product_json jsonb;
  required_column record;
  physical_column text;
  field_value text;
begin
  select *
    into product_row
    from public.product
   where product.product_code = is_all_required_filled.product_code;

  if not found then
    return false;
  end if;

  product_json := to_jsonb(product_row);

  for required_column in
    select f.code as column_key
      from public.npd_departments d
      join public.npd_department_field df
        on df.department_id = d.id and df.org_id = d.org_id and df.required = true
      join public.npd_field_catalog f
        on f.id = df.field_id and f.org_id = df.org_id and f.active = true
     where d.org_id = product_row.org_id
       and lower(d.code) = lower(is_all_required_filled.dept)
       and d.active = true
     order by df.display_order nulls last, f.code
  loop
    physical_column := lower(required_column.column_key);

    if not product_json ? physical_column then
      return false;
    end if;

    field_value := product_json ->> physical_column;
    if field_value is null or nullif(btrim(field_value), '') is null then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;
